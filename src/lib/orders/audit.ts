/**
 * Audit trail I/O — append-only `audit_log` writes under service-role authority
 * (the trail is tamper-proof from clients). Split from service.ts so modules on
 * either side of it (restock, service) share one writer without an import cycle.
 */

import { createServiceClient } from "../supabase/service";
import type { Database } from "../supabase/database.types";

/** Append an audit_log row (service-role; the trail is tamper-proof from clients). */
export async function recordAudit(args: {
  orderId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details: Record<string, unknown>;
}): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("audit_log").insert({
    actor_id: null,
    action: args.action,
    entity_type: args.entityType ?? "order",
    entity_id: args.entityId ?? args.orderId,
    details: args.details as Database["public"]["Tables"]["audit_log"]["Insert"]["details"],
  });
  if (error) {
    throw error;
  }
}
