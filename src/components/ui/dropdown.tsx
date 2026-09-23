"use client";

/**
 * Dropdown menu — Radix primitive, CSS-animated.
 * Used for the account menu, and for the "more actions" control on post rows.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = DropdownMenu.Root;
export const DropdownTrigger = DropdownMenu.Trigger;
export const DropdownGroup = DropdownMenu.Group;
export const DropdownSeparator = ({ className }: { className?: string }) => (
  <DropdownMenu.Separator className={cn("my-1 h-px bg-line", className)} />
);

const ITEM =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted " +
  "outline-none transition-colors data-[highlighted]:bg-paper-sunken data-[highlighted]:text-ink " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-52 overflow-hidden rounded-lg border border-line bg-paper-raised p-1.5",
          "shadow-[var(--shadow-lg)] outline-none",
          "data-[state=open]:animate-menu-in data-[state=closed]:animate-menu-out",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function DropdownItem({
  className,
  danger = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { danger?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(ITEM, danger && "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger", className)}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn("px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint", className)}
      {...props}
    />
  );
}
