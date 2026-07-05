import Link from "next/link";

/** Auth pages: centered card on porcelain background (C10 design). */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[520px] border border-border bg-card px-[50px] pb-[64px] pt-[56px]">
        <div className="mx-auto max-w-[420px]">
          <Link
            href="/"
            className="block text-center font-display text-[17px] font-medium tracking-[-0.02em]"
          >
            Nazeer &amp; Nazeers
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
