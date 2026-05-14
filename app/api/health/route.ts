import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string> = {};

  // DB check
  try {
    await db.execute(sql`SELECT 1`);
    checks.db = "ok";
  } catch (err) {
    checks.db = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // AI gateway check
  const aiGatewayUrl = process.env.AI_GATEWAY_URL;
  const aiGatewayToken = process.env.AI_GATEWAY_TOKEN;
  checks.ai_gateway = aiGatewayUrl && aiGatewayToken ? "configured" : "not_configured";

  const allOk = checks.db === "ok";

  return NextResponse.json(
    { ok: allOk, checks },
    { status: allOk ? 200 : 503 }
  );
}
