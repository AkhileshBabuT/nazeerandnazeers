import { describe, expect, it } from "vitest";
import { RESERVATION_WINDOW_MS } from "./checkout";
import { gateFor, paymentDeadlineIso } from "./payment-gate";

const CREATED = "2026-06-11T10:00:00.000Z";
const createdMs = Date.parse(CREATED);
const deadlineMs = createdMs + RESERVATION_WINDOW_MS;

describe("paymentDeadlineIso", () => {
  it("is created_at + the 15-minute reservation window", () => {
    expect(paymentDeadlineIso(CREATED)).toBe("2026-06-11T10:15:00.000Z");
  });
});

describe("gateFor", () => {
  it("pending inside the window → active with the derived deadline", () => {
    expect(gateFor("pending", CREATED, createdMs)).toEqual({
      kind: "active",
      deadlineIso: "2026-06-11T10:15:00.000Z",
    });
    expect(gateFor("pending", CREATED, deadlineMs - 1)).toEqual({
      kind: "active",
      deadlineIso: "2026-06-11T10:15:00.000Z",
    });
  });

  it("pending AT the deadline instant → expired (boundary is outside)", () => {
    expect(gateFor("pending", CREATED, deadlineMs)).toEqual({
      kind: "expired",
    });
  });

  it("pending past the window → expired", () => {
    expect(gateFor("pending", CREATED, deadlineMs + 60_000)).toEqual({
      kind: "expired",
    });
  });

  it("cancelled → cancelled regardless of the clock", () => {
    expect(gateFor("cancelled", CREATED, createdMs)).toEqual({
      kind: "cancelled",
    });
    expect(gateFor("cancelled", CREATED, deadlineMs + 1)).toEqual({
      kind: "cancelled",
    });
  });

  it("every money-moved status → paid (route to confirmation)", () => {
    for (const status of [
      "paid",
      "processing",
      "shipped",
      "delivered",
      "refunded",
      "partially_refunded",
    ] as const) {
      expect(gateFor(status, CREATED, createdMs)).toEqual({ kind: "paid" });
    }
  });
});
