import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { Eyebrow } from "@/components/ui/misc";
import { BookOpenIcon, PenIcon, SparkleIcon } from "@/components/ui/icons";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Publish on Folio for free. No paywall, no engagement mechanics, no algorithm — just your writing and the people who want to read it.",
  alternates: { canonical: "/signup" },
  robots: { index: true, follow: true },
};

const PROMISES = [
  {
    icon: PenIcon,
    title: "An editor that gets out of the way",
    body: "Markdown, autosave every second, and a publish button that never asks you to confirm that you're sure.",
  },
  {
    icon: BookOpenIcon,
    title: "Readers, not metrics",
    body: "You see reads, read time and completion — numbers that describe attention rather than vanity.",
  },
  {
    icon: SparkleIcon,
    title: "No third-party anything",
    body: "Your password is hashed with Web Crypto before it leaves the request. No analytics scripts, no trackers.",
  },
];

export default async function SignupPage() {
  const user = await getSession();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto grid max-w-5xl gap-16 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <Eyebrow className="mb-4">Join Folio</Eyebrow>
        <h1 className="font-display text-display text-ink">
          Publish something
          <br />
          worth reading.
        </h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-muted">
          Free, forever. No credit card, no paywall, no growth team deciding who sees your work.
        </p>

        <ul className="mt-10 space-y-6">
          {PROMISES.map((promise) => (
            <li key={promise.title} className="flex gap-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper-raised text-ink-muted">
                <promise.icon className="size-4.5" />
              </span>
              <div>
                <p className="font-medium text-ink">{promise.title}</p>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">{promise.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-line bg-paper-raised p-6 shadow-[var(--shadow-md)] sm:p-8">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">Create your account</h2>
        <p className="mt-1.5 text-sm text-ink-muted">Ten fields? No. Four.</p>
        <div className="mt-6">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
