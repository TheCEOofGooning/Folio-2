'use client';

import { useActionState, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon } from '@/components/icons';
import { updateProfileAction, type ProfileFormState } from '@/lib/actions/profile';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/card';

export function ProfileForm({
  defaultValues,
}: {
  defaultValues: {
    displayName: string;
    bio: string;
    location: string;
    avatarUrl: string;
    username: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState | null, FormData>(updateProfileAction, null);
  const [avatarUrl, setAvatarUrl] = useState(defaultValues.avatarUrl);

  // Clear the success flag after a moment so the affordance does not linger.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar
          name={defaultValues.displayName}
          username={defaultValues.username}
          src={avatarUrl || null}
          size="lg"
        />
        <p className="text-sm text-muted">
          Leave the image URL empty to keep your generated avatar.
          <br />
          Your profile: <span className="text-ink">folio/{defaultValues.username}</span>
        </p>
      </div>

      <Field label="Display name">
        <Input name="displayName" defaultValue={defaultValues.displayName} required maxLength={60} />
      </Field>

      <Field label="Avatar URL" error={state?.field === 'avatarUrl' ? state.error : undefined}>
        <Input
          name="avatarUrl"
          type="url"
          defaultValue={defaultValues.avatarUrl}
          onChange={(event) => setAvatarUrl(event.target.value)}
          placeholder="https://…"
        />
      </Field>

      <Field label="Bio" hint={`${280} characters max`}>
        <Textarea name="bio" rows={3} defaultValue={defaultValues.bio} maxLength={280} />
      </Field>

      <Field label="Location">
        <Input name="location" defaultValue={defaultValues.location} maxLength={60} placeholder="Lisbon, PT" />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner className="h-4 w-4" /> : null}
          Save changes
        </Button>
        <AnimatePresence>
          {flash ? (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
            >
              <CheckIcon size={15} /> Saved
            </motion.span>
          ) : null}
        </AnimatePresence>
        {state?.error && !state.field ? <span className="text-sm text-red-500">{state.error}</span> : null}
      </div>
    </form>
  );
}
