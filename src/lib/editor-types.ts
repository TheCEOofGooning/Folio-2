/**
 * Shared types for the editor ↔ server-action boundary.
 *
 * They live outside the `"use server"` modules because Next requires every export
 * of a server-action file to be an async function — constants and interfaces have
 * to be imported from a plain module.
 */

export const MAX_TITLE_LENGTH = 160;
export const MAX_CONTENT_LENGTH = 200_000;
export const MAX_SUBTITLE_LENGTH = 240;
export const MAX_COMMENT_LENGTH = 4_000;
export const AUTOSAVE_DEBOUNCE_MS = 1_400;

/** The mutable slice of a post the editor owns. */
export interface EditorPatch {
  title?: string;
  subtitle?: string;
  content?: string;
  tags?: string[];
  coverImage?: string | null;
  coverPreset?: string;
}

/** Server → client snapshot used by the autosave indicator. */
export interface EditorStatus {
  state: "idle" | "saving" | "saved" | "error";
  message?: string;
  updatedAt?: string;
  wordCount?: number;
  readingMinutes?: number;
}
