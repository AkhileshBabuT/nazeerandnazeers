"use client";

import { useEffect, useState } from "react";
import { countdownView, remainingMs } from "@/lib/checkout/countdown";
import { cn } from "@/lib/utils";

/**
 * C6 reservation countdown (PRD 04 C6): ticks against the SERVER-computed
 * deadline and HARD-UNMOUNTS the gateway at 0 — `children` (the payment
 * card) is replaced by `expired` (the server-rendered expired gate), never
 * hidden or disabled. Every decision is the pure, unit-tested `countdownView`
 * (src/lib/checkout/countdown.ts); this island is a trivial switch over it.
 *
 * `initialNowMs` comes from the server (`nowMs()` seam) so SSR and hydration
 * render the same label; the first effect tick syncs to the client clock.
 * The countdown is a courtesy — `gateFor` on the server stays authoritative.
 */
export function ReservationCountdown({
  deadlineIso,
  initialNowMs,
  expired,
  children,
}: {
  deadlineIso: string;
  initialNowMs: number;
  expired: React.ReactNode;
  children: React.ReactNode;
}) {
  const [now, setNow] = useState(initialNowMs);

  useEffect(() => {
    // First tick (1s) also absorbs any SSR→client drift from `initialNowMs`.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const view = countdownView(remainingMs(deadlineIso, now));

  if (view.kind === "expired") {
    return <>{expired}</>;
  }

  return (
    <>
      {/* The sanctioned pill (PRD §3.3): charcoal field + gold DM Mono digits;
          under 3 minutes it flips to the vermillion-outlined stamp. */}
      <div className="flex justify-center">
        <p
          role="timer"
          className={cn(
            "inline-flex items-baseline gap-2 rounded-full px-5 py-2",
            view.kind === "closing"
              ? "border border-destructive text-destructive"
              : "bg-primary text-gold",
          )}
        >
          <span className="eyebrow">
            {view.kind === "closing" ? "Hold expires" : "Held for you"}
          </span>
          <span aria-hidden>·</span>
          <span className="ledger text-sm">{view.label}</span>
        </p>
      </div>
      {children}
    </>
  );
}
