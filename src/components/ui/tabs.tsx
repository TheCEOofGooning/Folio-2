"use client";

/**
 * Tabs — Radix primitive with an underline indicator.
 *
 * Used where state should live in the DOM rather than the URL (the library's
 * "Saved / History" switch). Views that need to be linkable use plain links and
 * `searchParams` instead — see the dashboard and feed sort controls.
 */
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 border-b border-line", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent",
        "px-3 py-2 text-sm font-medium text-ink-muted transition-colors",
        "hover:text-ink focus-visible:outline-none",
        "data-[state=active]:border-ink data-[state=active]:text-ink",
        "[&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("focus-visible:outline-none data-[state=active]:animate-[panel-in_200ms_var(--ease-out-soft)]", className)}
      {...props}
    />
  );
}
