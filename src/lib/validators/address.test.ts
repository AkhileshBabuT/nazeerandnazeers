import { describe, it, expect } from "vitest";
import { addressInputSchema } from "./address";

const valid = {
  full_name: "Aisha Khan",
  phone: "9876543210",
  line1: "1 Jeweller's Lane",
  city: "Bengaluru",
  state: "Karnataka",
  postal_code: "560001",
};

describe("addressInputSchema", () => {
  it("accepts a valid address and defaults country + is_default", () => {
    const r = addressInputSchema.parse(valid);
    expect(r.country).toBe("India");
    expect(r.is_default).toBe(false);
  });

  it("rejects a PIN code that is not 6 digits", () => {
    expect(
      addressInputSchema.safeParse({ ...valid, postal_code: "123" }).success,
    ).toBe(false);
  });

  it("requires a full name", () => {
    expect(
      addressInputSchema.safeParse({ ...valid, full_name: "" }).success,
    ).toBe(false);
  });

  it("carries is_default through when set", () => {
    const r = addressInputSchema.parse({ ...valid, is_default: true });
    expect(r.is_default).toBe(true);
  });
});
