import * as RadixAvatar from "@radix-ui/react-avatar";
import { cn, initials } from "@/lib/utils";
import type { AuthorSummary } from "@/db/types";

/**
 * Avatar with a deterministic fallback.
 *
 * When a writer hasn't uploaded a picture, the fallback is their initials on a
 * hue derived from their user id — stable across sessions and devices, no
 * gravatar request, no layout shift (Radix reserves the box before the image
 * loads). The result is that a fresh account still looks deliberate.
 */
const SIZES = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-[0.6875rem]",
  md: "size-10 text-xs",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
} as const;

export function Avatar({
  user,
  size = "md",
  className,
}: {
  user: Pick<AuthorSummary, "displayName" | "avatarUrl" | "avatarHue"> & { username?: string };
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const hue = user.avatarHue ?? 20;

  return (
    <RadixAvatar.Root
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
        "ring-1 ring-inset ring-black/6 dark:ring-white/8",
        SIZES[size],
        className,
      )}
    >
      {user.avatarUrl ? (
        <RadixAvatar.Image
          src={user.avatarUrl}
          alt={user.displayName}
          className="size-full object-cover"
          // Avatars are user-supplied URLs; a plain <img> avoids the Next image
          // optimiser's allow-list and keeps 40 avatars off the build-time config.
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <RadixAvatar.Fallback
        delayMs={user.avatarUrl ? 200 : 0}
        className="flex size-full items-center justify-center font-semibold uppercase tracking-wide"
        style={{
          background: `linear-gradient(140deg, oklch(0.86 0.07 ${hue}), oklch(0.74 0.11 ${(hue + 40) % 360}))`,
          color: `oklch(0.32 0.07 ${hue})`,
        }}
      >
        {initials(user.displayName || user.username || "?")}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
