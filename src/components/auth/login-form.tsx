"use client";

/**
 * Sign-in form.
 *
 * One component, two hosts: the `/login` page and the in-context sign-in dialog
 * that appears when an anonymous reader tries to clap. `useActionState` gives us
 * progressive enhancement — the form posts and validates even before hydration.
 */
import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { loginAction } from "@/server/actions/auth";
import { initialAuthState, type AuthState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage, Input, Label } from "@/components/ui/input";

export function LoginForm({
  nextPath,
  inline = false,
  onSuccess,
  footer = true,
}: {
  /** Where to land after signing in. Ignored when `inline`. */
  nextPath?: string;
  /** When true the action returns instead of redirecting, so a dialog can stay open. */
  inline?: boolean;
  onSuccess?: () => void;
  footer?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(loginAction, initialAuthState);
  const [showPassword, setShowPassword] = useState(false);
  const id = useId();

  useEffect(() => {
    if (state.status === "success") onSuccess?.();
  }, [state.status, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {inline ? <input type="hidden" name="inline" value="1" /> : null}
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      <div>
        <Label htmlFor={`${id}-identifier`} hint="email or @username">
          Sign in as
        </Label>
        <Input
          id={`${id}-identifier`}
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.values?.identifier ?? (inline ? "" : "demo@folio.dev")}
          aria-invalid={state.errors?.identifier ? true : undefined}
          placeholder="you@example.com"
        />
        <FieldError>{state.errors?.identifier}</FieldError>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor={`${id}-password`}>Password</Label>
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="mb-1.5 text-xs text-ink-faint transition-colors hover:text-ink"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <Input
          id={`${id}-password`}
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          defaultValue={inline ? "" : "folio-demo"}
          aria-invalid={state.errors?.password ? true : undefined}
          placeholder="••••••••"
        />
        <FieldError>{state.errors?.password}</FieldError>
      </div>

      {state.message && state.status === "error" ? <FormMessage>{state.message}</FormMessage> : null}

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {footer ? (
        <p className="pt-1 text-center text-[0.8125rem] text-ink-muted">
          New to Folio?{" "}
          <Link href="/signup" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Create an account
          </Link>
        </p>
      ) : null}
    </form>
  );
}
