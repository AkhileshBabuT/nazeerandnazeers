import Link from "next/link";

export default function ShopNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center md:px-0">
      <p className="eyebrow text-xs text-muted-foreground">Not found</p>
      <h1 className="mt-3 font-display text-xl tracking-[-0.02em]">
        This piece could not be found
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        It may have been removed or the link is incorrect.
      </p>
      <Link
        href="/shop"
        className="mt-8 inline-block text-sm underline-offset-2 transition-colors hover:text-gold"
      >
        ← Back to shop
      </Link>
    </div>
  );
}
