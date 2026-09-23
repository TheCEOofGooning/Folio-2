"use client";

/**
 * Profile settings.
 *
 * Avatar upload is client-side resizing into a data URI rather than an upload
 * endpoint: the image is drawn to a canvas at 256×256, encoded as WebP, and only
 * then sent. It avoids object storage, signed URLs and an upload API entirely —
 * a 3 MB photo becomes ~14 KB before it ever leaves the browser.
 */
import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { updateProfileAction } from "@/server/actions/auth";
import { initialAuthState, type AuthState } from "@/lib/auth/form-state";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FieldError, FormMessage, Input, Label, Textarea } from "@/components/ui/input";
import { ImageIcon, TrashIcon } from "@/components/ui/icons";
import { relativeTime } from "@/lib/utils";

const MAX_BIO = 400;
const MAX_TAGLINE = 120;

export function ProfileForm({
  user,
}: {
  user: {
    username: string;
    email: string;
    displayName: string;
    tagline: string;
    bio: string;
    avatarUrl: string | null;
    avatarHue: number;
  };
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updateProfileAction, initialAuthState);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [processedAt, setProcessedAt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (state.status === "idle" && state.message) setProcessedAt(new Date().toISOString());
  }, [state]);

  const onPickFile = async (file: File) => {
    setUploadError(undefined);
    if (!file.type.startsWith("image/")) {
      setUploadError("That file isn't an image.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setUploadError("Please choose an image under 6 MB.");
      return;
    }

    try {
      const dataUrl = await resizeToDataUrl(file, 256);
      setAvatarUrl(dataUrl);
    } catch {
      setUploadError("We couldn't process that image. Try a different one.");
    }
  };

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="avatarUrl" value={avatarUrl} />

      {/* Avatar */}
      <div className="flex flex-wrap items-center gap-5">
        <Avatar user={{ displayName: user.displayName, avatarUrl: avatarUrl || null, avatarHue: user.avatarHue }} size="xl" />
        <div>
          <p className="text-sm font-medium text-ink">Profile picture</p>
          <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-ink-muted">
            Resized to 256×256 in your browser before it is saved. Without one, Folio uses your
            initials on a colour derived from your username.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <ImageIcon className="size-4" /> Upload image
            </Button>
            {avatarUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarUrl("")}>
                <TrashIcon className="size-4" /> Remove
              </Button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onPickFile(file);
              event.target.value = "";
            }}
          />
          {uploadError ? <FieldError>{uploadError}</FieldError> : null}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-name`}>Display name</Label>
          <Input
            id={`${id}-name`}
            name="displayName"
            defaultValue={user.displayName}
            maxLength={60}
            required
            aria-invalid={state.errors?.displayName ? true : undefined}
          />
          <FieldError>{state.errors?.displayName}</FieldError>
        </div>

        <div>
          <Label htmlFor={`${id}-username`} hint="permanent">
            Username
          </Label>
          <Input id={`${id}-username`} value={`@${user.username}`} readOnly disabled />
        </div>
      </div>

      <div>
        <Label htmlFor={`${id}-tagline`} hint={`${MAX_TAGLINE} characters`}>
          Tagline
        </Label>
        <Input
          id={`${id}-tagline`}
          name="tagline"
          defaultValue={user.tagline}
          maxLength={MAX_TAGLINE}
          placeholder="Writes about craft, tools and attention."
          aria-invalid={state.errors?.tagline ? true : undefined}
        />
        <p className="mt-1.5 text-xs text-ink-faint">
          One sentence. Appears next to your name on every story.
        </p>
        <FieldError>{state.errors?.tagline}</FieldError>
      </div>

      <div>
        <Label htmlFor={`${id}-bio`} hint={`${MAX_BIO} characters`}>
          Bio
        </Label>
        <Textarea
          id={`${id}-bio`}
          name="bio"
          defaultValue={user.bio}
          maxLength={MAX_BIO}
          rows={5}
          placeholder="A few lines about what you write and why anyone should care."
          aria-invalid={state.errors?.bio ? true : undefined}
        />
        <FieldError>{state.errors?.bio}</FieldError>
      </div>

      {state.message ? (
        <FormMessage tone={state.status === "error" ? "error" : "info"}>{state.message}</FormMessage>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" variant="primary" loading={pending}>
          Save profile
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={`/u/${user.username}`}>View public profile</Link>
        </Button>
        {processedAt ? (
          <span className="text-xs text-ink-faint">Saved {relativeTime(processedAt)}</span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Downscales and re-encodes an image entirely in the browser.
 * `createImageBitmap` + canvas keeps the main thread quiet and avoids a
 * dependency for something the platform already does.
 */
async function resizeToDataUrl(file: File, size: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");

  // Cover-crop to a square so avatars never look squashed.
  const side = Math.min(bitmap.width, bitmap.height);
  const offsetX = (bitmap.width - side) / 2;
  const offsetY = (bitmap.height - side) / 2;

  context.drawImage(bitmap, offsetX, offsetY, side, side, 0, 0, size, size);
  bitmap.close();

  const webp = canvas.toDataURL("image/webp", 0.86);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.86);
}
