import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { LoaderIcon } from "./icons";

/**
 * Button.
 *
 * `asChild` (Radix Slot) means one component covers `<button>`, `<Link>` and
 * `<a>` without duplicating styles or nesting interactive elements. Variants are
 * limited to the four the product actually needs — every extra variant is a
 * decision somebody has to make twice.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-paper hover:bg-ink/88 active:bg-ink shadow-[var(--shadow-sm)] data-[state=open]:bg-ink/88",
  secondary:
    "border border-line bg-paper-raised text-ink hover:border-line-strong hover:bg-paper-sunken data-[state=open]:bg-paper-sunken",
  ghost: "text-ink-muted hover:bg-paper-sunken hover:text-ink data-[state=open]:bg-paper-sunken",
  soft: "bg-accent-soft text-accent hover:bg-accent-soft/75",
  danger: "text-danger hover:bg-danger/10",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-md px-3 text-[0.8125rem]",
  md: "h-9.5 gap-2 rounded-md px-3.5 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-[0.9375rem]",
  icon: "size-9.5 rounded-md",
  "icon-sm": "size-8 rounded-md",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[background-color,border-color,color,transform,opacity] duration-150 ease-[var(--ease-out-soft)]",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <LoaderIcon className="size-4" />
          {children}
        </>
      ) : (
        children
      )}
    </Component>
  );
}

/**
 * Compact icon button with an accessible name — the nav, the editor toolbar and
 * the article actions all use this rather than raw `<button>` elements, which is
 * what keeps `aria-label` from being forgotten.
 */
export function IconButton({
  label,
  className,
  variant = "ghost",
  size = "icon",
  ...props
}: ButtonProps & { label: string }) {
  return (
    <Button aria-label={label} title={label} variant={variant} size={size} className={className} {...props} />
  );
}
