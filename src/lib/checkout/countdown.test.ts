import { describe, expect, it } from "vitest";
import {
  CLOSING_THRESHOLD_MS,
  countdownView,
  mmss,
  remainingMs,
} from "./countdown";

const DEADLINE = "2026-06-12T10:15:00.000Z";
const deadlineMs = Date.parse(DEADLINE);

describe("remainingMs", () => {
  it("counts down toward the deadline", () => {
    expect(remainingMs(DEADLINE, deadlineMs - 872_000)).toBe(872_000);
  });

  it("is 0 exactly at the deadline", () => {
    expect(remainingMs(DEADLINE, deadlineMs)).toBe(0);
  });

  it("clamps at 0 past the deadline (never negative)", () => {
    expect(remainingMs(DEADLINE, deadlineMs + 60_000)).toBe(0);
  });
});

describe("mmss", () => {
  it("formats whole minutes and seconds, zero-padded", () => {
    expect(mmss(872_000)).toBe("14:32");
    expect(mmss(134_000)).toBe("02:14");
    expect(mmss(15 * 60 * 1000)).toBe("15:00");
    expect(mmss(9_000)).toBe("00:09");
  });

  it("floors sub-second remainders (no phantom extra second)", () => {
    expect(mmss(872_999)).toBe("14:32");
  });
});

describe("countdownView", () => {
  it("is active with the mm:ss label above the closing threshold", () => {
    expect(countdownView(872_000)).toEqual({ kind: "active", label: "14:32" });
  });

  it("is still active at exactly 3 minutes (strictly-under flips)", () => {
    expect(countdownView(CLOSING_THRESHOLD_MS)).toEqual({
      kind: "active",
      label: "03:00",
    });
  });

  it("is closing strictly under 3 minutes", () => {
    expect(countdownView(CLOSING_THRESHOLD_MS - 1)).toEqual({
      kind: "closing",
      label: "02:59",
    });
    expect(countdownView(134_000)).toEqual({ kind: "closing", label: "02:14" });
  });

  /**
   * THE gate test (issue 04 acceptance criteria): at 0 the view union says
   * `expired` — the island, a trivial switch over this union, renders the
   * expired gate INSTEAD of its children, so the payment form is absent from
   * the tree (not disabled, not hidden). This pure test is the "form absent"
   * coverage; no RTL exists in this repo.
   */
  it("expired ⇒ the gateway must not render: no active/closing kind, no label", () => {
    const atZero = countdownView(0);
    expect(atZero).toEqual({ kind: "expired" });
    expect("label" in atZero).toBe(false);

    expect(countdownView(-1)).toEqual({ kind: "expired" });
    // End-to-end through remainingMs: the deadline instant itself is expired,
    // matching gateFor's `now >= deadline` boundary.
    expect(countdownView(remainingMs(DEADLINE, deadlineMs))).toEqual({
      kind: "expired",
    });
  });
});
