import Image from "next/image";
import { cn, coverGradient } from "@/lib/utils";

/**
 * Cover art.
 *
 * Most writers never upload an image, so the default is not an empty grey box but
 * a deterministic gradient + hairline texture derived from the post's preset.
 * It costs zero network requests, contributes nothing to LCP, and looks
 * intentional in a feed.
 *
 * Real covers go through `next/image`, so on Vercel they are resized and encoded
 * to AVIF/WebP at the edge and cached for 30 days.
 */
export function Cover({
  image,
  preset,
  title,
  priority = false,
  className,
  sizes = "(max-width: 768px) 100vw, 400px",
  overlay = 0,
}: {
  image?: string | null;
  preset?: string | null;
  title: string;
  /** Set on above-the-fold covers only — a hero image should not lazy-load. */
  priority?: boolean;
  className?: string;
  sizes?: string;
  /** 0–1 scrim strength, for keeping overlaid text legible. */
  overlay?: number;
}) {
  const isRemote = Boolean(image && /^https?:/i.test(image));
  const isInline = Boolean(image && image.startsWith("data:"));

  return (
    <div className={cn("relative overflow-hidden bg-paper-sunken", className)}>
      {isRemote ? (
        <Image
          src={image as string}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.025]"
        />
      ) : isInline ? (
        // Data URIs are already inline; the optimiser would pass them through.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image as string}
          alt=""
          className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.025]"
        />
      ) : (
        <div
          className="absolute inset-0 transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.025]"
          style={{ backgroundImage: coverGradient(preset) }}
          aria-hidden
        >
          <span
            className="absolute inset-0 opacity-[0.16] mix-blend-multiply dark:opacity-[0.22] dark:mix-blend-soft-light"
            style={{
              backgroundImage:
                "repeating-linear-gradient(115deg, transparent 0 13px, rgb(0 0 0 / 0.35) 13px 14px)",
            }}
          />
        </div>
      )}

      {overlay > 0 ? (
        <span
          className="absolute inset-0"
          style={{ background: `linear-gradient(to top, rgb(0 0 0 / ${overlay}) 0%, transparent 65%)` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
