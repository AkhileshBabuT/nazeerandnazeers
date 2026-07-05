import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata = { title: "Settings" };

/**
 * A8 /admin/settings — reads the singleton `settings` row and delegates
 * mutation to SettingsForm (client island, uses updateSettings action).
 */
export default async function AdminSettingsPage() {
  await connection(); // uncached; don't serve stale settings

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("gst_metal_bps, gst_making_bps, max_rate_age_seconds")
    .eq("id", true)
    .single();

  if (error || !data) {
    return (
      <p className="text-destructive text-sm">
        Could not load settings{error ? `: ${error.message}` : "."}
      </p>
    );
  }

  return (
    <div className="max-w-[600px] space-y-8">
      <h1 className="eyebrow text-muted-foreground">Settings</h1>
      <section className="border border-border">
        <div className="border-b border-border px-6 py-3">
          <h2 className="eyebrow text-xs text-muted-foreground">TAX &amp; FRESHNESS</h2>
        </div>
        <div className="px-6 py-6">
          <SettingsForm
            current={{
              gst_metal_bps: data.gst_metal_bps,
              gst_making_bps: data.gst_making_bps,
              max_rate_age_seconds: data.max_rate_age_seconds,
            }}
          />
        </div>
      </section>
    </div>
  );
}
