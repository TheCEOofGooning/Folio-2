import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import { hueFromString, initials } from '@/lib/utils/format';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-24 w-24 text-3xl',
} as const;

/**
 * Avatar with a deterministic generated fallback — a hue derived from the
 * username, so a brand-new account still looks intentional and no network
 * request is made.
 */
export function Avatar({
  name,
  username,
  src,
  size = 'md',
  className,
}: {
  name: string;
  username: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const shared = cn('relative shrink-0 overflow-hidden rounded-full ring-1 ring-line/60', SIZES[size], className);

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={96}
        height={96}
        className={cn(shared, 'object-cover')}
        sizes="96px"
      />
    );
  }

  const hue = hueFromString(username);
  return (
    <span
      aria-hidden="false"
      role="img"
      aria-label={name}
      className={cn(shared, 'grid place-items-center font-semibold')}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 88%), hsl(${(hue + 40) % 360} 65% 78%))`,
        color: `hsl(${hue} 60% 24%)`,
      }}
    >
      {initials(name) || '?'}
    </span>
  );
}
