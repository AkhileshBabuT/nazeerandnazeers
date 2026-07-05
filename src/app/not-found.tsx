import Link from "next/link";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="eyebrow text-xs text-muted-foreground">404</p>
        <h1 className="mt-3 font-display text-xl tracking-[-0.02em]">
          Page not found
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/"
            className="text-sm underline-offset-2 transition-colors hover:text-gold"
          >
            Home
          </Link>
          <Link
            href="/shop"
            className="text-sm underline-offset-2 transition-colors hover:text-gold"
          >
            Browse pieces
          </Link>
        </div>
      </div>
    </div>
  );
}
