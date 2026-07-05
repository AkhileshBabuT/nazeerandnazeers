"use client";

import { useState, useTransition } from "react";
import { updateSettings } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/actions/admin-guard";

interface CurrentSettings {
  gst_metal_bps: number;
  gst_making_bps: number;
  max_rate_age_seconds: number;
}

function humanizeSecs(secs: number): string {
  if (secs >= 86400) return `${(secs / 86400).toFixed(0)} day${secs / 86400 === 1 ? "" : "s"}`;
  if (secs >= 3600) return `${(secs / 3600).toFixed(0)} hour${secs / 3600 === 1 ? "" : "s"}`;
  return `${(secs / 60).toFixed(0)} minutes`;
}

/**
 * A8 Settings form — GST bps with live % echo, staleness ceiling humanized.
 * Confirm dialog shows old → new before submitting.
 */
export function SettingsForm({ current }: { current: CurrentSettings }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<void> | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [metalBps, setMetalBps] = useState(String(current.gst_metal_bps));
  const [makingBps, setMakingBps] = useState(String(current.gst_making_bps));
  const [maxAgeSecs, setMaxAgeSecs] = useState(String(current.max_rate_age_seconds));

  const metalBpsNum = parseInt(metalBps, 10) || 0;
  const makingBpsNum = parseInt(makingBps, 10) || 0;
  const maxAgeSecsNum = parseInt(maxAgeSecs, 10) || 0;

  const changed =
    metalBpsNum !== current.gst_metal_bps ||
    makingBpsNum !== current.gst_making_bps ||
    maxAgeSecsNum !== current.max_rate_age_seconds;

  function submit() {
    setResult(null);
    startTransition(async () => {
      const r = await updateSettings({
        gst_metal_bps: metalBpsNum,
        gst_making_bps: makingBpsNum,
        max_rate_age_seconds: maxAgeSecsNum,
      });
      setResult(r);
      setConfirming(false);
    });
  }

  return (
    <div className="space-y-8 max-w-sm">
      {result?.ok === true && (
        <p className="eyebrow text-xs text-gold">Settings saved — changes apply to new prices and new orders only.</p>
      )}
      {result?.ok === false && result.code === "error" && (
        <p className="text-xs text-destructive">{result.message}</p>
      )}

      {/* GST fields */}
      <div className="space-y-5">
        <div>
          <label className="eyebrow text-xs text-muted-foreground">
            GST on metal value (bps)
          </label>
          <div className="mt-1 flex items-baseline gap-3">
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              value={metalBps}
              onChange={(e) => setMetalBps(e.target.value)}
              className="ledger w-24 border-b bg-transparent py-1.5 text-sm outline-none"
            />
            <span className="ledger text-sm text-gold">
              {(metalBpsNum / 100).toFixed(2)} %
            </span>
          </div>
        </div>

        <div>
          <label className="eyebrow text-xs text-muted-foreground">
            GST on making charges (bps)
          </label>
          <div className="mt-1 flex items-baseline gap-3">
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              value={makingBps}
              onChange={(e) => setMakingBps(e.target.value)}
              className="ledger w-24 border-b bg-transparent py-1.5 text-sm outline-none"
            />
            <span className="ledger text-sm text-gold">
              {(makingBpsNum / 100).toFixed(2)} %
            </span>
          </div>
        </div>

        <div>
          <label className="eyebrow text-xs text-muted-foreground">
            Max rate age (seconds)
          </label>
          <div className="mt-1 flex items-baseline gap-3">
            <input
              type="number"
              min={60}
              max={604800}
              step={60}
              value={maxAgeSecs}
              onChange={(e) => setMaxAgeSecs(e.target.value)}
              className="ledger w-28 border-b bg-transparent py-1.5 text-sm outline-none"
            />
            <span className="text-sm text-muted-foreground">
              {maxAgeSecsNum > 0 ? humanizeSecs(maxAgeSecsNum) : "—"}
            </span>
          </div>
        </div>
      </div>

      {!confirming && changed && (
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
        >
          Save changes →
        </Button>
      )}

      {confirming && (
        <div className="rounded-xs border border-border bg-secondary px-4 py-4 text-sm space-y-3">
          <p className="eyebrow text-xs text-muted-foreground">Confirm changes</p>
          <dl className="space-y-1 text-xs">
            <div className="flex gap-4">
              <dt className="text-muted-foreground w-36">GST metal</dt>
              <dd className="ledger">
                {(current.gst_metal_bps / 100).toFixed(2)}% →{" "}
                <span className="text-gold">{(metalBpsNum / 100).toFixed(2)}%</span>
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="text-muted-foreground w-36">GST making</dt>
              <dd className="ledger">
                {(current.gst_making_bps / 100).toFixed(2)}% →{" "}
                <span className="text-gold">{(makingBpsNum / 100).toFixed(2)}%</span>
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="text-muted-foreground w-36">Max rate age</dt>
              <dd className="ledger">
                {humanizeSecs(current.max_rate_age_seconds)} →{" "}
                <span className="text-gold">{humanizeSecs(maxAgeSecsNum)}</span>
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Changes apply to new prices and new orders only — existing order pages are unchanged.
          </p>
          <div className="flex gap-3">
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Confirm save"}
            </Button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="eyebrow text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
