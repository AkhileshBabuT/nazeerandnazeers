/**
 * C6 reservation-countdown decisions (PRD 04 C6) — PURE.
 *
 * The ReservationCountdown island is a trivial switch over `countdownView`'s
 * union: `expired` means the island renders the expired gate INSTEAD of its
 * children, so the payment gateway subtree is absent from the tree — never
 * hidden, never disabled. That rule is unit-tested here (the repo has no
 * @testing-library/react; vitest is node-env), which is why the island keeps
 * zero logic of its own.
 */

/** Under 3 minutes the pill flips to the vermillion HOLD EXPIRES stamp. */
export const CLOSING_THRESHOLD_MS = 3 * 60 * 1000;

/** Milliseconds left on the hold; clamped at 0 (never negative). */
export function remainingMs(deadlineIso: string, nowMs: number): number {
  return Math.max(0, Date.parse(deadlineIso) - nowMs);
}

/** `872000` → `14:32` — whole seconds, floored, zero-padded. */
export function mmss(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * What the island must render. `expired` carries no label on purpose: there
 * is nothing left to count and the gateway must not render.
 */
export type CountdownView =
  | { kind: "active"; label: string }
  | { kind: "closing"; label: string }
  | { kind: "expired" };

/**
 * Decide the pill (or the gate) from the remaining milliseconds. 0 remaining
 * is already expired — `gateFor` treats the deadline instant as outside the
 * window, and the client agrees.
 */
export function countdownView(remaining: number): CountdownView {
  if (remaining <= 0) {
    return { kind: "expired" };
  }
  const label = mmss(remaining);
  return remaining < CLOSING_THRESHOLD_MS
    ? { kind: "closing", label }
    : { kind: "active", label };
}
