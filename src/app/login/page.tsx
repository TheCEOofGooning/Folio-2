import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { Eyebrow } from "@/components/ui/misc";
import { getSession } from "@/lib/auth/session";

/**
 * Sign in.
 *
 * Reads the session to bounce already-authenticated visitors onwards, which makes
 * this route dynamic — an acceptable trade for a page that is one form and no
 * data. Everything else in Folio stays cached.
 */
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Folio to write, clap and keep a library.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getSession();
  if (user) redirect(params.next?.startsWith("/") ? params.next : "/dashboard");

  return (
    <div className="mx-auto grid max-w-5xl gap-16 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center">
      <div className="order-2 lg:order-1">
        <Eyebrow className="mb-4">Welcome back</Eyebrow>
        <h1 className="font-display text-display text-ink">Sign in to Folio</h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-muted">
          Your library, your drafts and your claps are waiting exactly where you left them.
        </p>

        <div className="mt-8 rounded-xl border border-line bg-paper-raised p-5">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Trying the demo?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The seed script creates a reader account with a small library already saved:
          </p>
          <ul className="mt-3 space-y-1 text-sm text-ink">
            <li>
              <span className="text-ink-faint">Email</span> demo@folio.dev
            </li>
            <li>
              <span className="text-ink-faint">Password</span> folio-demo
            </li>
          </ul>
        </div>

        <p className="mt-8 text-sm text-ink-muted">
          No account?{" "}
          <Link
            href="/signup"
            className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Create one in twenty seconds
          </Link>
          .
        </p>
      </div>

      <div className="order-1 rounded-2xl border border-line bg-paper-raised p-6 shadow-[var(--shadow-md)] sm:p-8 lg:order-2">
        <LoginForm nextPath={params.next} />
      </div>
    </div>
  );
}
