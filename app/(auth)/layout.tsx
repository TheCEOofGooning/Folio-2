import { Logo } from '@/components/logo';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ambient relative flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center" aria-label="Back to Folio home">
          <Logo />
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-card sm:p-8">{children}</div>
      </div>
    </div>
  );
}
