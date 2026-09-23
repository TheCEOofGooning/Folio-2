"use client";

/**
 * Reader heartbeat.
 *
 * Accumulates *active* reading time (the tab must be visible) plus the furthest
 * scroll depth reached, and reports both to `/api/beacon` via `sendBeacon` — the
 * one API that survives the page being closed or backgrounded, which is exactly
 * when the final measurement is lost otherwise.
 *
 * Reporting schedule, in order of importance:
 *   1. `visibilitychange` → hidden (the last reliable moment)
 *   2. `pagehide` (covers bfcache and mobile task-switching)
 *   3. every 30 seconds, so long reads are not lost to a crash
 *
 * The server dedupes by viewer hash, so a refresh counts as the same reader and
 * `view_count` moves by one. The beacon's response carries the fresh count, which
 * is broadcast as a `folio:views` event and picked up by the action bar.
 */
import { useEffect, useRef } from "react";

const INTERVAL_MS = 30_000;

export function ArticleTelemetry({ postId }: { postId: string }) {
  const secondsRef = useRef(0);
  const ratioRef = useRef(0);
  const lastTickRef = useRef<number>(Date.now());
  const sentRef = useRef(false);

  useEffect(() => {
    const measureRatio = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return 1;
      const ratio = Math.min(1, Math.max(0, window.scrollY / scrollable));
      if (ratio > ratioRef.current) ratioRef.current = ratio;
    };

    const tick = () => {
      const now = Date.now();
      if (document.visibilityState === "visible") {
        secondsRef.current += Math.round((now - lastTickRef.current) / 1000);
      }
      lastTickRef.current = now;
    };

    const send = (final = false) => {
      tick();
      const payload = JSON.stringify({
        postId,
        seconds: final ? secondsRef.current : Math.min(secondsRef.current, 120),
        ratio: ratioRef.current,
        progress: ratioRef.current,
      });

      if (final) {
        // Reset only after a final flush; interim sends are non-destructive because
        // the server clamps and accumulates.
        secondsRef.current = Math.min(secondsRef.current, 60);
      }

      if (document.visibilityState === "hidden" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/beacon", new Blob([payload], { type: "application/json" }));
        return;
      }

      void fetch("/api/beacon", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      })
        .then((response) => response.json())
        .then((data: { viewCount?: number | null }) => {
          if (typeof data.viewCount === "number") {
            window.dispatchEvent(
              new CustomEvent("folio:views", { detail: { viewCount: data.viewCount } }),
            );
          }
        })
        .catch(() => undefined);
    };

    measureRatio();
    const onScroll = () => measureRatio();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send(true);
      else lastTickRef.current = Date.now();
    };
    const onHide = () => {
      if (sentRef.current) return;
      sentRef.current = true;
      send(true);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);

    const timer = setInterval(() => send(false), INTERVAL_MS);
    send(false); // count the reader immediately — the first pageview

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      clearInterval(timer);
      send(true);
    };
  }, [postId]);

  return null;
}
