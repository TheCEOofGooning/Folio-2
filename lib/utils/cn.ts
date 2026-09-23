import { clsx, type ClassValue } from 'clsx';

/** Conditional class names without a utility library. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
