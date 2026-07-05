import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/validators";
import type { CheckoutActionResult } from "@/app/actions/checkout";
import {
  checkoutInputFromForm,
  mapCheckoutState,
  reconfirmDelta,
} from "./form";

/** FormData.get-shaped getter over a plain record. */
function getterOf(fields: Record<string, string>) {
  return (name: string) => fields[name] ?? null;
}

const fullFields = {
  full_name: "Aisha Nazeer",
  phone: "+91 98765 43210",
  line1: "14 Marine Drive",
  line2: "Flat 3B",
  city: "Kochi",
  state: "Kerala",
  postal_code: "682001",
};

describe("checkoutInputFromForm", () => {
  it("builds the full payload, country fixed to India", () => {
    const input = checkoutInputFromForm(getterOf(fullFields), 9581252);
    expect(input).toEqual({
      shipping_address: { ...fullFields, country: "India" },
      seen_total_paise: 9581252,
      shipping_method_id: null,
      coupon_code: null,
    });
  });

  it("passes checkoutSchema validation", () => {
    const input = checkoutInputFromForm(getterOf(fullFields), 9581252);
    expect(checkoutSchema.safeParse(input).success).toBe(true);
  });

  it("trims whitespace from every field", () => {
    const input = checkoutInputFromForm(
      getterOf({ ...fullFields, full_name: "  Aisha Nazeer  " }),
      100,
    );
    expect(input.shipping_address.full_name).toBe("Aisha Nazeer");
  });

  it("omits an empty optional line2", () => {
    const input = checkoutInputFromForm(
      getterOf({ ...fullFields, line2: "   " }),
      100,
    );
    expect("line2" in input.shipping_address).toBe(false);
  });

  it("maps missing fields (null) to empty strings for zod to reject", () => {
    const input = checkoutInputFromForm(getterOf({}), 100);
    expect(input.shipping_address.full_name).toBe("");
    expect(checkoutSchema.safeParse(input).success).toBe(false);
  });
});

describe("reconfirmDelta", () => {
  it("up: price increased, plus-signed label", () => {
    expect(reconfirmDelta(9581252, 9612492)).toEqual({
      direction: "up",
      amountPaise: 31240,
      label: "+₹312.40",
    });
  });

  it("down: price decreased, minus-signed label", () => {
    expect(reconfirmDelta(9581252, 9571442)).toEqual({
      direction: "down",
      amountPaise: 9810,
      label: "−₹98.10",
    });
  });

  it("same: zero delta", () => {
    expect(reconfirmDelta(100, 100)).toEqual({
      direction: "same",
      amountPaise: 0,
      label: "₹0.00",
    });
  });
});

describe("mapCheckoutState — every CheckoutActionResult branch", () => {
  it("null (not yet submitted) → pristine form", () => {
    expect(mapCheckoutState(null)).toEqual({
      kind: "form",
      fieldErrors: {},
      banner: null,
    });
  });

  it("ok → redirect to the order's pay page", () => {
    const state: CheckoutActionResult = {
      ok: true,
      order_id: "5a2e7d04-1111-4222-8333-944455556666",
      order_number: "ORD-2026-7",
      total_paise: 9581252,
      client_secret: "pi_secret",
    };
    expect(mapCheckoutState(state)).toEqual({
      kind: "redirect",
      to: "/checkout/5a2e7d04-1111-4222-8333-944455556666/pay",
    });
  });

  it("invalid → first message per address field, prefix stripped", () => {
    const state: CheckoutActionResult = {
      ok: false,
      code: "invalid",
      fieldErrors: {
        "shipping_address.full_name": ["full name is required"],
        "shipping_address.postal_code": [
          "postal code must be a 6-digit PIN code",
          "second message ignored",
        ],
      },
    };
    expect(mapCheckoutState(state)).toEqual({
      kind: "form",
      fieldErrors: {
        full_name: "full name is required",
        postal_code: "postal code must be a 6-digit PIN code",
      },
      banner: null,
    });
  });

  it("invalid with non-address errors → generic banner", () => {
    const state: CheckoutActionResult = {
      ok: false,
      code: "invalid",
      fieldErrors: { seen_total_paise: ["seen total must be integer Paise"] },
    };
    const ui = mapCheckoutState(state);
    expect(ui.kind).toBe("form");
    if (ui.kind === "form") {
      expect(ui.fieldErrors).toEqual({});
      expect(ui.banner).not.toBeNull();
    }
  });

  it("unauthenticated → sign-in / guest prompt state", () => {
    expect(mapCheckoutState({ ok: false, code: "unauthenticated" })).toEqual({
      kind: "unauthenticated",
    });
  });

  it("empty_cart → redirect back to the tray", () => {
    expect(mapCheckoutState({ ok: false, code: "empty_cart" })).toEqual({
      kind: "redirect",
      to: "/cart",
    });
  });

  it("price_unavailable → blocked state naming the material", () => {
    expect(
      mapCheckoutState({
        ok: false,
        code: "price_unavailable",
        material: "silver",
      }),
    ).toEqual({ kind: "price_unavailable", material: "silver" });
  });

  it("reconfirm → totals + computed delta (never auto-accepts)", () => {
    const state: CheckoutActionResult = {
      ok: false,
      code: "reconfirm",
      message: "The gold rate updated; please review your new total.",
      seen_total_paise: 9581252,
      true_total_paise: 9612492,
      tolerance_paise: 1000,
    };
    expect(mapCheckoutState(state)).toEqual({
      kind: "reconfirm",
      seenTotalPaise: 9581252,
      trueTotalPaise: 9612492,
      delta: { direction: "up", amountPaise: 31240, label: "+₹312.40" },
    });
  });

  it("out_of_stock → apology state", () => {
    expect(mapCheckoutState({ ok: false, code: "out_of_stock" })).toEqual({
      kind: "out_of_stock",
    });
  });

  it("error → form with a quiet banner carrying the message", () => {
    expect(
      mapCheckoutState({ ok: false, code: "error", message: "boom" }),
    ).toEqual({ kind: "form", fieldErrors: {}, banner: "boom" });
  });
});
