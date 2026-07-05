"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addToCart,
  removeCartItem,
  updateCartItemQuantity,
} from "@/app/actions/cart";

/**
 * C4 line controls: optimistic quantity stepper + remove with brief undo.
 * The server clamps to stock (`CartLineResult.quantity` is the truth) — a
 * clamped write reverts the optimistic value and explains inline.
 */
export function CartLineControls({
  cartItemId,
  productId,
  quantity,
}: {
  cartItemId: string;
  productId: string;
  quantity: number;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(quantity);
  const [removed, setRemoved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setQuantity(next: number) {
    const prev = qty;
    setQty(next); // optimistic
    setNotice(null);
    startTransition(async () => {
      const result = await updateCartItemQuantity({
        cart_item_id: cartItemId,
        quantity: next,
      });
      if (result.ok) {
        if (result.data.quantity !== next) {
          setQty(result.data.quantity);
          setNotice(
            `Only ${result.data.quantity} available — quantity adjusted`,
          );
        }
        router.refresh();
      } else {
        setQty(prev); // revert on error
        setNotice("Could not update quantity — please try again.");
      }
    });
  }

  function remove() {
    setRemoved(true); // optimistic
    setNotice(null);
    startTransition(async () => {
      const result = await removeCartItem({ cart_item_id: cartItemId });
      if (result.ok) {
        router.refresh();
      } else {
        setRemoved(false);
        setNotice("Could not remove — please try again.");
      }
    });
  }

  function undo() {
    startTransition(async () => {
      const result = await addToCart({ product_id: productId, quantity: qty });
      if (result.ok) {
        setRemoved(false);
        router.refresh();
      }
    });
  }

  if (removed) {
    return (
      <p className="text-sm text-muted-foreground">
        Removed.{" "}
        <button
          type="button"
          onClick={undo}
          disabled={pending}
          className="cursor-pointer underline transition-colors hover:text-gold"
        >
          Undo
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <div className="flex items-stretch border">
          <button
            type="button"
            aria-label="Decrease quantity"
            className="w-8 cursor-pointer py-1 transition-colors hover:text-gold disabled:opacity-40"
            disabled={qty <= 1 || pending}
            onClick={() => setQuantity(qty - 1)}
          >
            −
          </button>
          <span className="ledger flex w-10 items-center justify-center border-x text-sm">
            {qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            className="w-8 cursor-pointer py-1 transition-colors hover:text-gold disabled:opacity-40"
            disabled={pending}
            onClick={() => setQuantity(qty + 1)}
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="cursor-pointer text-sm text-muted-foreground underline transition-colors hover:text-foreground"
        >
          Remove
        </button>
      </div>
      {notice !== null && (
        <p className="text-xs text-hallmark">{notice}</p>
      )}
    </div>
  );
}
