import { cn } from "@/lib/utils";

/**
 * Form controls.
 *
 * Same shell for input and textarea so focus, invalid state and disabled state
 * are defined once. `aria-invalid` drives the visual state instead of a prop, so
 * the styling follows the accessibility tree rather than a parallel boolean.
 */
const FIELD_BASE =
  "w-full rounded-md border border-line bg-paper-raised px-3 py-2 text-[0.9375rem] text-ink " +
  "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-faint " +
  "hover:border-line-strong focus:border-accent focus:outline-none " +
  "focus:ring-4 focus:ring-accent/12 disabled:opacity-55 disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/12";

export function Input({ className, ...props }: React.ComponentPropsWithRef<"input">) {
  return <input className={cn(FIELD_BASE, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn(FIELD_BASE, "min-h-24 resize-y leading-relaxed", className)} {...props} />;
}

export function Label({
  className,
  children,
  hint,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label
      className={cn("mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium text-ink", className)}
      {...props}
    >
      <span>{children}</span>
      {hint ? <span className="text-2xs font-normal text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger">
      {children}
    </p>
  );
}

export function FormMessage({ children, tone = "error" }: { children?: string; tone?: "error" | "info" }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border px-3 py-2 text-[0.8125rem]",
        tone === "error"
          ? "border-danger/30 bg-danger/8 text-danger"
          : "border-line bg-paper-sunken text-ink-muted",
      )}
    >
      {children}
    </p>
  );
}
