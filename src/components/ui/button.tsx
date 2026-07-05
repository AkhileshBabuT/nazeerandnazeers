import { cn } from "@/lib/utils";

/**
 * Gallery Ledger buttons (PRD §3.4): primary = charcoal fill; secondary = 1px
 * charcoal outline; destructive = vermillion outline (fills only on confirm).
 */
const BASE =
  "eyebrow inline-flex cursor-pointer items-center justify-center rounded-xs px-6 py-3 transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2";

const VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline:
    "border border-primary bg-transparent text-foreground hover:border-gold hover:text-gold",
  destructive:
    "border border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-primary-foreground",
} as const;

type Variant = keyof typeof VARIANTS;

export function buttonVariants({
  variant = "primary",
  width,
  className,
}: {
  variant?: Variant;
  width?: "auto" | "full";
  className?: string;
} = {}) {
  return cn(BASE, VARIANTS[variant], width === "full" && "w-full", className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  width?: "auto" | "full";
}

export function Button({ className, variant, width, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, width }), className)}
      {...props}
    />
  );
}
