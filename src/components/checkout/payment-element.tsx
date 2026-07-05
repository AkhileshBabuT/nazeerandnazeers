"use client";

import { useState } from "react";
import {
  loadStripe,
  type Appearance,
  type Stripe,
} from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  confirmationReturnUrl,
  declineMessage,
  type PayPhase,
} from "@/lib/checkout/payment";
import { formatPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";

/**
 * C6 Stripe wiring (PRD §1.6): Elements provider + PaymentElement themed to
 * the Gallery Ledger tokens, charcoal PAY button, quiet inline decline copy
 * with retry inside the window. All decisions are pure
 * (src/lib/checkout/payment.ts); this island is wiring + markup.
 *
 * `loadStripe` is LAZY — the Stripe env keys may be BLANK in this repo, so
 * nothing here runs at module evaluation: the key is read at render and a
 * missing one renders the quiet unavailable note instead of the gateway.
 */
let stripePromise: Promise<Stripe | null> | null = null;

function getStripe(key: string): Promise<Stripe | null> {
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

/**
 * Gallery Ledger tokens (globals.css oklch, PRD §3.1) as sRGB hex — the
 * Elements iframe cannot read the page's CSS variables and Stripe's color
 * parser predates `oklch()`. Hairline borders, 2px radius, no shadows.
 */
const appearance: Appearance = {
  theme: "flat",
  variables: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSizeBase: "15px",
    borderRadius: "2px",
    colorPrimary: "#14110e" /* --primary  oklch(0.18 0.008 60) */,
    colorBackground: "#ffffff" /* --card */,
    colorText: "#14110e" /* --foreground */,
    colorTextSecondary: "#5a544e" /* --muted-foreground oklch(0.45 0.012 65) */,
    colorTextPlaceholder: "#5a544e",
    colorDanger: "#ba2b2e" /* --destructive oklch(0.52 0.18 25) */,
  },
  rules: {
    ".Input": {
      backgroundColor: "#ffffff",
      border: "1px solid #dad7d3" /* --border hairline oklch(0.88 0.006 72) */,
      boxShadow: "none",
    },
    ".Input:focus": {
      border: "1px solid #d0a348" /* --gold oklch(0.74 0.12 82) */,
      boxShadow: "none",
      outline: "none",
    },
    ".Label": {
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontSize: "11px",
      color: "#5a544e",
    },
    ".Tab": { border: "1px solid #dad7d3", boxShadow: "none" },
    ".Tab--selected": { border: "1px solid #14110e", boxShadow: "none" },
  },
};

/** DM Sans for the Elements iframe (next/font assets aren't reachable there). */
const elementsFonts = [
  {
    cssSrc:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap",
  },
];

export function PaymentSection({
  clientSecret,
  totalPaise,
  orderId,
}: {
  clientSecret: string;
  totalPaise: number;
  orderId: string;
}) {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;

  if (key === null) {
    return (
      <p className="mt-6 border px-4 py-3 text-sm text-muted-foreground">
        Payment is temporarily unavailable — please try again in a moment. You
        have not been charged.
      </p>
    );
  }

  return (
    <Elements
      stripe={getStripe(key)}
      options={{ clientSecret, appearance, fonts: elementsFonts }}
    >
      <PayForm totalPaise={totalPaise} orderId={orderId} />
    </Elements>
  );
}

/**
 * The form inside the Elements provider. Submitting locks the form (the
 * countdown above stays visible); a decline unlocks it — retry is allowed
 * while the window is open. Success never returns here: Stripe redirects to
 * the C7 `return_url`.
 */
function PayForm({
  totalPaise,
  orderId,
}: {
  totalPaise: number;
  orderId: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [phase, setPhase] = useState<PayPhase>({ kind: "ready" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stripe === null || elements === null || phase.kind === "submitting") {
      return;
    }
    setPhase({ kind: "submitting" });
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: confirmationReturnUrl(window.location.origin, orderId),
      },
    });
    // Only failures resolve here — success navigates away to C7.
    setPhase({ kind: "declined", message: declineMessage(error) });
  }

  const submitting = phase.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="mt-6" aria-busy={submitting}>
      <PaymentElement />
      {phase.kind === "declined" && (
        <p className="mt-4 text-sm text-destructive">{phase.message}</p>
      )}
      <Button
        type="submit"
        width="full"
        className="mt-6"
        disabled={stripe === null || submitting}
      >
        {submitting ? (
          "Processing…"
        ) : (
          <>
            Pay <span className="ledger">{formatPaise(totalPaise)}</span>
          </>
        )}
      </Button>
    </form>
  );
}
