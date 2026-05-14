import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { canaryDocuments } from "@/db/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, document_text, source_name } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_TITLE", message: "title is required" } },
        { status: 400 }
      );
    }
    if (!document_text || typeof document_text !== "string" || document_text.trim() === "") {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_TEXT", message: "document_text is required" } },
        { status: 400 }
      );
    }

    const [doc] = await db
      .insert(canaryDocuments)
      .values({
        title: title.trim(),
        documentText: document_text.trim(),
        sourceName: source_name ?? null,
      })
      .returning();

    if (!doc) {
      return NextResponse.json(
        { ok: false, error: { code: "INSERT_FAILED", message: "Failed to create document" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, document: doc }, { status: 201 });
  } catch (err) {
    console.error("[canary-documents POST]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const docs = await db
      .select()
      .from(canaryDocuments)
      .orderBy(desc(canaryDocuments.createdAt))
      .limit(50);

    return NextResponse.json({ ok: true, documents: docs });
  } catch (err) {
    console.error("[canary-documents GET]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
