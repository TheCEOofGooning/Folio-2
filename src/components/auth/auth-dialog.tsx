"use client";

/**
 * In-context sign-in.
 *
 * Shown when a signed-out reader interacts with something that needs an account
 * (clap, bookmark, follow, comment). It is the whole argument against redirecting
 * to `/login`: the reader keeps their scroll position, their place in the
 * article, and the intent that made them tap in the first place.
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@/components/ui/modal";
import { LoginForm } from "./login-form";

const REASONS: Record<string, string> = {
  clap: "Sign in to clap for this story.",
  bookmark: "Sign in to save stories to your library.",
  follow: "Sign in to follow writers.",
  comment: "Sign in to join the conversation.",
  write: "Sign in to start writing.",
  default: "Sign in to continue.",
};

export function AuthDialog({
  open,
  reason,
  onOpenChange,
  onAuthenticated,
}: {
  open: boolean;
  reason?: string;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: () => void;
}) {
  const pathname = usePathname();

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="sm" described>
        <ModalHeader
          title="Welcome back"
          description={REASONS[reason ?? "default"] ?? REASONS.default}
        />
        <ModalBody>
          <LoginForm inline nextPath={pathname} onSuccess={onAuthenticated} footer={false} />
          <p className="mt-5 border-t border-line pt-4 text-center text-[0.8125rem] text-ink-muted">
            No account yet?{" "}
            <Link
              href="/signup"
              className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              Create one
            </Link>{" "}
            — it takes about twenty seconds.
          </p>
          <p className="mt-3 rounded-md bg-paper-sunken px-3 py-2 text-center text-xs text-ink-faint">
            Demo account: <span className="font-medium text-ink-muted">demo@folio.dev</span> /{" "}
            <span className="font-medium text-ink-muted">folio-demo</span>
          </p>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
