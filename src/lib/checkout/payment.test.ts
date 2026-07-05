import { describe, expect, it } from "vitest";
import {
  confirmationReturnUrl,
  declineMessage,
} from "./payment";

describe("confirmationReturnUrl", () => {
  it("points at the order's C7 confirmation", () => {
    expect(
      confirmationReturnUrl(
        "https://nazeerandnazeers.example",
        "0b9f2f6e-7b1a-4f4e-9d3c-2a1b3c4d5e6f",
      ),
    ).toBe(
      "https://nazeerandnazeers.example/orders/0b9f2f6e-7b1a-4f4e-9d3c-2a1b3c4d5e6f/confirmation",
    );
  });
});

describe("declineMessage", () => {
  it("uses Stripe's customer-written copy for card errors", () => {
    expect(
      declineMessage({ type: "card_error", message: "Your card was declined." }),
    ).toBe("Your card was declined.");
  });

  it("uses Stripe's copy for validation errors", () => {
    expect(
      declineMessage({
        type: "validation_error",
        message: "Your card number is incomplete.",
      }),
    ).toBe("Your card number is incomplete.");
  });

  it("falls back to the generic quiet line for internal error types", () => {
    const generic = declineMessage(undefined);
    expect(generic).toMatch(/you have not been charged/i);
    expect(
      declineMessage({ type: "api_error", message: "Internal stack detail" }),
    ).toBe(generic);
    expect(declineMessage({ type: "card_error" })).toBe(generic);
    expect(declineMessage({ type: "card_error", message: "" })).toBe(generic);
  });
});
