import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { RULESET_VERSION } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const checks = {
    database: false,
    openai: Boolean(process.env.OPENAI_API_KEY),
    inngest: Boolean(
      process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY,
    ),
    storage: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
    ),
  };
  try {
    await getDatabase().execute(sql`select 1 as ready`);
    checks.database = true;
  } catch {
    checks.database = false;
  }
  const ready = Object.values(checks).every(Boolean);
  return Response.json(
    {
      status: ready ? "ready" : "degraded",
      checks,
      rulesetVersion: RULESET_VERSION,
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local",
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
