"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/collections", label: "Collections" },
  { href: "/admin/rates", label: "Rates" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/shipping", label: "Shipping" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/settings", label: "Settings" },
];

/** Admin sidebar nav — gold left border on the active item (A0 brief). */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col py-2">
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "eyebrow border-l-2 border-transparent px-5 py-3 transition-colors hover:text-foreground",
              active
                ? "border-gold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
