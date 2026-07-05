/**
 * Underline-style input (design contract §3.4): hairline border-bottom,
 * gold on focus, small-caps label above.
 */
export function UnderlineField({
  label,
  error,
  ...props
}: {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="eyebrow text-muted-foreground">{label}</span>
      <input
        className="mt-2 w-full border-b bg-transparent py-2 text-base outline-none transition-colors focus:border-gold focus:shadow-[0_1px_0_0_var(--color-gold)]"
        {...props}
      />
      {error !== undefined && (
        <span className="mt-1 block text-xs text-destructive">{error}</span>
      )}
    </label>
  );
}
