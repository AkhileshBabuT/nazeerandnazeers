import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="py-16 text-center">
      <p className="eyebrow text-xs text-muted-foreground">404</p>
      <p className="mt-3 text-sm">This resource doesn&rsquo;t exist.</p>
      <Link
        href="/admin/orders"
        className="mt-6 inline-block text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-gold"
      >
        ← Orders
      </Link>
    </div>
  );
}
