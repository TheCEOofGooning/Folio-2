"use server";

/**
 * Authentication Server Actions.
 *
 * These are the only place in Folio where a cookie is written, and the only
 * place a password is handled. Registration and login both end in the same two
 * steps — create a session row, sign a cookie — so there is exactly one code
 * path that can mint a session.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import {
  createUser,
  getUserForLogin,
  updateProfile,
  updateUserPassword,
} from "@/db/queries/users";
import { hueFromString } from "@/lib/utils";
import { rateLimit, resetLimit } from "@/lib/rate-limit";
import { throwIfInvalid, validateLogin, validateProfile, validateRegister } from "@/lib/validation";
import { revalidatePath } from "next/cache";

// The state shape lives outside this file: a `"use server"` module may only
// export async functions, and `initialAuthState` is a runtime value.
import type { AuthState } from "@/lib/auth/form-state";

export type { AuthState };

async function clientKey(prefix: string): Promise<string> {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    "unknown";
  return `${prefix}:${ip}`;
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = {
    email: String(formData.get("email") ?? ""),
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  };

  const limit = rateLimit(await clientKey("register"), 5, 900);
  if (!limit.allowed) {
    return {
      status: "error",
      message: `Too many sign-up attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      values,
    };
  }

  let input;
  try {
    input = throwIfInvalid(
      validateRegister({ ...values, password: String(formData.get("password") ?? "") }),
    );
  } catch (error) {
    const errors = (error as { errors?: Record<string, string> }).errors ?? {};
    return { status: "error", errors, values, message: "Please fix the highlighted fields." };
  }

  try {
    const passwordHash = await hashPassword(input.password);
    const user = await createUser({
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      avatarHue: hueFromString(input.username),
    });

    await createSession(user.id);
    resetLimit(await clientKey("register"));
  } catch (error) {
    // Unique indexes are the arbiter — a race between two signups resolves here
    // rather than producing a confusing duplicate account.
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      const conflict = /email/i.test((error as { detail?: string }).detail ?? "")
        ? { email: "That email is already registered." }
        : { username: "That username is taken." };
      return { status: "error", errors: conflict, values, message: "Please pick another." };
    }
    return {
      status: "error",
      values,
      message: "We couldn't create your account just now. Please try again.",
    };
  }

  redirect("/dashboard?welcome=1");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = { identifier: String(formData.get("identifier") ?? "") };

  const limit = rateLimit(await clientKey("login"), 8, 300);
  if (!limit.allowed) {
    return {
      status: "error",
      message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      values,
    };
  }

  let input;
  try {
    input = throwIfInvalid(
      validateLogin({ identifier: values.identifier, password: String(formData.get("password") ?? "") }),
    );
  } catch (error) {
    return {
      status: "error",
      errors: (error as { errors?: Record<string, string> }).errors,
      values,
      message: "Please fix the highlighted fields.",
    };
  }

  const user = await getUserForLogin(input.identifier).catch(() => null);

  // Always run a verification — against a dummy hash when the account doesn't
  // exist — so response timing does not reveal whether an email is registered.
  const ok = await verifyPassword(
    input.password,
    user?.passwordHash ??
      "pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  );

  if (!user || !ok) {
    return { status: "error", values, message: "Those credentials don't match an account." };
  }

  try {
    await createSession(user.id);
    // Opportunistic re-hash when the stored parameters are outdated.
    if (needsRehash(user.passwordHash)) {
      await hashPassword(input.password)
        .then((hash) => updateUserPassword(user.id, hash))
        .catch(() => undefined);
    }
  } catch {
    return { status: "error", values, message: "We couldn't start your session. Please try again." };
  }

  resetLimit(await clientKey("login"));

  // `inline=1` is set by the sign-in dialog, which must not navigate away from
  // the article the reader was in the middle of. The dialog re-reads the session
  // and refreshes the route instead.
  if (String(formData.get("inline") ?? "") === "1") {
    return { status: "success", message: "Signed in." };
  }

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const user = await getSession();
  await destroySession();          // revokes the session row AND clears the cookie
  if (user) revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfileAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await getSession();
  if (!user) return { status: "error", message: "Your session expired. Please sign in again." };

  let input;
  try {
    input = throwIfInvalid(
      validateProfile({
        displayName: String(formData.get("displayName") ?? ""),
        bio: String(formData.get("bio") ?? ""),
        tagline: String(formData.get("tagline") ?? ""),
        avatarUrl: String(formData.get("avatarUrl") ?? ""),
      }),
    );
  } catch (error) {
    return {
      status: "error",
      errors: (error as { errors?: Record<string, string> }).errors,
      message: "Please fix the highlighted fields.",
    };
  }

  await updateProfile(user.id, input);
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/dashboard/settings");
  return { status: "idle", message: "Profile saved." };
}
