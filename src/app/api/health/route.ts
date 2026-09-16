import { NextResponse } from "next/server";

/**
 * Route Handler de ejemplo/verificacion (S1-04): confirma que el runtime
 * responde y, si hay conexion a DB configurada, que Drizzle puede consultar.
 */
export async function GET() {
  try {
    const { db } = await import("@/lib/db/client");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute<{ now: string }>(sql`select now()`);
    return NextResponse.json({ ok: true, now: result[0]?.now ?? null });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
