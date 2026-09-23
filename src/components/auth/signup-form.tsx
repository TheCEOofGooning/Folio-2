"use client";

/**
 * Registration form.
 *
 * Username availability is checked live against a Server Action as the reader
 * types, debounced — a courtesy, not a gate. The unique index in Postgres is the
 * only thing that actually prevents duplicates, and the action reports a
 * conflict cleanly if two people race for the same handle.
 */
import Link from "next/link";
import { useActionState, useCallback, useEffect, useId, useState } from "react";
import { registerAction } from "@/server/actions/auth";
import { initialAuthState, type AuthState } from "@/lib/auth/form-state";
import { checkUsernameAction } from "@/server/actions/username";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage, Input, Label } from "@/components/ui/input";
import { CheckIcon, CloseIcon, LoaderIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(registerAction, initialAuthState);
  const [username, setUsername] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const id = useId();

  const check = useCallback(async (value: string) => {
    if (value.length < 3) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const result = await checkUsernameAction(value);
    if (!result.ok) setAvailability("invalid");
    else setAvailability(result.available ? "available" : "taken");
  }, []);

  useEffect(() => {
    if (!username) {
      setAvailability("idle");
      return;
    }
    const timer = setTimeout(() => void check(username), 420);
    return () => clearTimeout(timer);
  }, [username, check]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-name`}>Display name</Label>
          <Input
            id={`${id}-name`}
            name="displayName"
            autoComplete="name"
            required
            defaultValue={state.values?.displayName ?? ""}
            aria-invalid={state.errors?.displayName ? true : undefined}
            placeholder="Ada Merrill"
          />
          <FieldError>{state.errors?.displayName}</FieldError>
        </div>

        <div>
          <Label htmlFor={`${id}-username`} hint="letters, numbers, _">
            Username
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.9375rem] text-ink-faint">
              @
            </span>
            <Input
              id={`${id}-username`}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={24}
              className="pl-7.5 pr-9"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              aria-invalid={state.errors?.username || availability === "taken" ? true : undefined}
              placeholder="ada"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-live="polite">
              {availability === "checking" ? <LoaderIcon className="size-4 text-ink-faint" /> : null}
              {availability === "available" ? <CheckIcon className="size-4 text-success" /> : null}
              {availability === "taken" || availability === "invalid" ? (
                <CloseIcon className="size-4 text-danger" />
              ) : null}
            </span>
          </div>
          <FieldError>
            {state.errors?.username ??
              (availability === "taken" ? "That username is already taken." : undefined) ??
              (availability === "invalid" ? "3–24 characters; letters, numbers and underscores." : undefined)}
          </FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor={`${id}-email`}>Email</Label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          defaultValue={state.values?.email ?? ""}
          aria-invalid={state.errors?.email ? true : undefined}
          placeholder="you@example.com"
        />
        <FieldError>{state.errors?.email}</FieldError>
      </div>

      <div>
        <Label htmlFor={`${id}-password`} hint="8+ characters">
          Password
        </Label>
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={state.errors?.password ? true : undefined}
          placeholder="••••••••"
        />
        <FieldError>{state.errors?.password}</FieldError>
      </div>

      {state.message && state.status === "error" ? <FormMessage>{state.message}</FormMessage> : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        disabled={availability === "taken" || availability === "invalid"}
        className={cn("w-full")}
      >
        {pending ? "Creating your account…" : "Create account"}
      </Button>

      <p className="text-center text-[0.8125rem] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs leading-relaxed text-ink-faint">
        Passwords are hashed with PBKDF2-SHA256 (210,000 iterations) before they touch the database.
      </p>
    </form>
  );
}
