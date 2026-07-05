import Link from "next/link";

/** Storefront footer (design handoff §6). */
export function SiteFooter() {
  return (
    <footer className="mt-16 flex flex-col gap-4 border-t px-4 py-7 md:flex-row md:items-baseline md:gap-10 md:px-12">
      <Link href="/" className="font-display text-md tracking-[-0.02em]">
        Nazeer &amp; Nazeers
      </Link>
      <nav className="flex flex-col gap-4 md:flex-row md:items-baseline md:gap-6">
        <Link
          href="/shop"
          className="eyebrow text-muted-foreground transition-colors hover:text-foreground"
        >
          The Collection
        </Link>
        <Link
          href="/account/orders"
          className="eyebrow text-muted-foreground transition-colors hover:text-foreground"
        >
          Your Orders
        </Link>
        <a
          href="mailto:contact@nazeerandnazeers.example"
          className="eyebrow text-muted-foreground transition-colors hover:text-foreground"
        >
          Contact
        </a>
      </nav>
      <span className="eyebrow text-muted-foreground md:ml-auto">
        Priced Live · GST Itemized
      </span>
    </footer>
  );
}
