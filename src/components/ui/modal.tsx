"use client";

/**
 * Modal — Radix Dialog primitive, animated in pure CSS.
 *
 * Accessibility comes from Radix: focus trapping, restore-focus-on-close,
 * escape-to-dismiss and correct `aria-modal` wiring. The enter/exit animations
 * are CSS keyframes keyed off Radix's `data-state` attribute, so opening a dialog
 * costs no JavaScript beyond the primitive itself.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { CloseIcon } from "./icons";

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

export function ModalContent({
  className,
  children,
  /** Set for wide surfaces like the editor's preview sheet. */
  size = "md",
  showClose = true,
  described = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof Dialog.Content> & {
  size?: "sm" | "md" | "lg" | "xl";
  showClose?: boolean;
  described?: boolean;
}) {
  const widths = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  } as const;

  return (
    <Dialog.Portal>
      <Dialog.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px]",
          "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
        )}
      />
      <Dialog.Content
        // Radix warns when a dialog has no description; most Folio dialogs are
        // title-only by design, so opt out explicitly rather than shipping an
        // invisible sentence purely to satisfy a console warning.
        aria-describedby={described ? undefined : undefined}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-xl border border-line bg-paper",
          "shadow-[var(--shadow-lg)] focus:outline-none",
          "data-[state=open]:animate-modal-in data-[state=closed]:animate-modal-out",
          widths[size],
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <Dialog.Close
            aria-label="Close"
            className={cn(
              "absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md",
              "text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink",
            )}
          >
            <CloseIcon className="size-4.5" />
          </Dialog.Close>
        ) : null}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function ModalHeader({
  title,
  description,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-line px-6 py-5 pr-14", className)}>
      <Dialog.Title className="font-display text-xl tracking-[-0.02em] text-ink">{title}</Dialog.Title>
      {description ? (
        <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {description}
        </Dialog.Description>
      ) : null}
    </div>
  );
}

export function ModalBody({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function ModalFooter({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper-sunken/60 px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}
