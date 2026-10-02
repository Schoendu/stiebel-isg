import { createIngestHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseSecretKey = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";

async function storeMeasurement(measurement: Record<string, unknown>): Promise<void> {
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEYS must be configured");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/measurements?on_conflict=device_id,timestamp`,
    {
      method: "POST",
      headers: {
        apikey: supabaseSecretKey,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(measurement),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase returned ${response.status}: ${detail.slice(0, 256)}`);
  }
}

Deno.serve(createIngestHandler({
  ISG_DEVICE_ID: Deno.env.get("ISG_DEVICE_ID"),
  ISG_INGEST_TOKEN: Deno.env.get("ISG_INGEST_TOKEN"),
}, storeMeasurement));
