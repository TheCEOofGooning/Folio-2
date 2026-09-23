/** components/logo.tsx — wordmark. Inline SVG so there is no image request. */

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ''}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" className="text-accent">
        <rect x="2.5" y="5.5" width="18" height="24" rx="3" fill="currentColor" opacity="0.16" />
        <rect
          x="8.5"
          y="2.5"
          width="21"
          height="24"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <path d="M14 10.5h10M14 15.5h10M14 20.5h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className="font-serif text-[21px] font-semibold tracking-tight text-ink">Folio</span>
    </span>
  );
}
