/**
 * Small, dependency-free helpers shared across the UI.
 * (`clsx` + `tailwind-merge` are the only two client utilities Folio ships, and
 * they exist so component overrides behave predictably rather than for styling.)
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 days ago" — with an absolute date for anything older than a month. */
export function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";

  const delta = date.getTime() - Date.now();
  const absolute = Math.abs(delta);

  if (absolute > 30 * 86_400_000) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
  }

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, milliseconds] of UNITS) {
    if (absolute >= milliseconds) return formatter.format(Math.round(delta / milliseconds), unit);
  }
  return "just now";
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function formatNumber(value: number | null | undefined): string {
  const number = Number(value ?? 0);
  if (number < 1000) return String(number);
  if (number < 1_000_000) return `${(number / 1000).toFixed(number < 10_000 ? 1 : 0)}K`;
  return `${(number / 1_000_000).toFixed(1)}M`;
}

export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds ?? 0)));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes < 60) return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** URL-safe slug. Falls back to a short random suffix when the title is exotic. */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72)
    .replace(/^-|-$/g, "");
  return slug || `post-${Math.random().toString(36).slice(2, 8)}`;
}

/** Deterministic hue from an arbitrary string — used for generated avatars. */
export function hueFromString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 360;
  }
  return hash;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Deterministic gradient for posts without a cover image. */
export const COVER_PRESETS = {
  linen: "linear-gradient(135deg, #f6efe6 0%, #eadfd2 48%, #d9c9b6 100%)",
  dusk: "linear-gradient(135deg, #e8e4f4 0%, #cdc7ea 45%, #a8a2d6 100%)",
  moss: "linear-gradient(135deg, #e6efe4 0%, #cfe0cb 45%, #a9c6a4 100%)",
  clay: "linear-gradient(135deg, #f7e8e2 0%, #eccfc4 45%, #d8a894 100%)",
  sand: "linear-gradient(135deg, #f8f2e2 0%, #ece0c2 45%, #d9c79b 100%)",
  indigo: "linear-gradient(135deg, #e3e9f6 0%, #c3cfe9 45%, #97a8d1 100%)",
  slate: "linear-gradient(135deg, #eceef1 0%, #d5dae1 45%, #b0b8c4 100%)",
  rose: "linear-gradient(135deg, #f9e9ee 0%, #eed2dd 45%, #d8a8ba 100%)",
} as const;

export type CoverPreset = keyof typeof COVER_PRESETS;

export const COVER_PRESET_KEYS = Object.keys(COVER_PRESETS) as CoverPreset[];

export function coverGradient(preset: string | null | undefined): string {
  return COVER_PRESETS[(preset as CoverPreset) ?? "linen"] ?? COVER_PRESETS.linen;
}
