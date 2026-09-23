import type { Metadata } from "next";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { Eyebrow } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/db/queries/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getProfile(user.username, user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <header className="border-b border-line pb-8">
        <Eyebrow className="mb-3">Settings</Eyebrow>
        <h1 className="font-display text-display text-ink">Your public profile</h1>
        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          This is what readers see above your stories. The tagline is the single highest-leverage
          character count on the platform — it is the sentence that decides whether somebody reads
          the next paragraph.
        </p>
      </header>

      <div className="mt-8">
        <ProfileForm
          user={{
            username: user.username,
            email: user.email,
            displayName: profile?.displayName ?? user.displayName,
            tagline: profile?.tagline ?? "",
            bio: profile?.bio ?? "",
            avatarUrl: profile?.avatarUrl ?? user.avatarUrl ?? null,
            avatarHue: profile?.avatarHue ?? user.avatarHue,
          }}
        />
      </div>

      <section className="mt-14 rounded-xl border border-line bg-paper-sunken/50 p-6">
        <h2 className="font-display text-xl tracking-[-0.02em] text-ink">Security</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-faint">Password hashing</dt>
            <dd className="text-ink-muted">PBKDF2-SHA256 · 210,000 iterations · 16-byte random salt</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-faint">Session cookies</dt>
            <dd className="text-ink-muted">HMAC-signed, httpOnly, SameSite=Lax, 30-day expiry</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-faint">Revocation</dt>
            <dd className="text-ink-muted">Changing your password signs out every device instantly</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Folio stores no third-party analytics, no tracking pixels and no advertising identifiers.
          Reading statistics are aggregated per story against a salted hash of the request, never
          against a stored IP address.
        </p>
      </section>
    </div>
  );
}
