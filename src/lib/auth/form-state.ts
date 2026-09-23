/**
 * Form state shared between the auth Server Actions and their client forms.
 *
 * This module exists for one reason: a `"use server"` file may only export async
 * functions. Types are erased at compile time, so an interface is fine — but
 * `initialAuthState` is a runtime object, and exporting it from
 * `server/actions/auth.ts` fails at runtime with:
 *
 *     Error: A "use server" file can only export async functions, found object.
 *
 * Keeping it here means one source of truth for the empty state, importable from
 * both sides of the boundary, with no `"use server"` constraints.
 */
export interface AuthState {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string | undefined>;
  /** Echoed back so the form survives a failed submit. */
  values?: Record<string, string>;
}

export const initialAuthState: AuthState = { status: "idle" };
