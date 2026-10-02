import { createIngestHandler, createRestMeasurementStore } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const ingestToken = Deno.env.get("ISG_INGEST_TOKEN");
const secretKeyName = Deno.env.get("ISG_SECRET_KEY_NAME") ?? "default";
const secretKey = Deno.env.get(secretKeyName);

if (!supabaseUrl || !ingestToken || !secretKey) {
  throw new Error("ingest function is missing required configuration");
}

Deno.serve(createIngestHandler({
  token: ingestToken,
  store: createRestMeasurementStore(supabaseUrl, secretKey),
}));

