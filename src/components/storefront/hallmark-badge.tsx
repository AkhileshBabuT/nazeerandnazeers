/** BIS hallmark badge (design contract §3.4): stamped-seal look, mono HUID. */
export function HallmarkBadge({ huid }: { huid: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 rounded-xs border border-hallmark px-2.5 py-1.5 text-hallmark">
      <span className="eyebrow">BIS Hallmark</span>
      <span className="ledger text-xs">{huid}</span>
    </span>
  );
}
