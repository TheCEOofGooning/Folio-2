"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/** Switch — Radix primitive. Used for publishing options and settings toggles. */
export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5.5 w-9.5 shrink-0 cursor-pointer items-center rounded-full border border-line",
        "bg-paper-sunken transition-colors duration-200",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-paper-raised shadow-sm ring-0",
          "transition-transform duration-200 ease-[var(--ease-out-soft)]",
          "translate-x-0.75 data-[state=checked]:translate-x-4.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
