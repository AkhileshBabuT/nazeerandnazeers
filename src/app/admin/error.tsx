"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-16 text-center">
      <p className="eyebrow text-xs text-muted-foreground">Error</p>
      <p className="mt-3 text-sm">An error occurred loading this section.</p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-8 items-center border px-3 text-xs transition-colors hover:border-gold hover:text-gold"
      >
        Retry
      </button>
    </div>
  );
}
