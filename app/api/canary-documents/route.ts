import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { canaryDocuments } from "@/db/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

const MAX_TITLE_LENGTH = 500;
const MAX_TEXT_LENGTH = 100000;

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
    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { ok: false, error: { code: "TITLE_TOO_LONG", message: `title must be under ${MAX_TITLE_LENGTH} characters` } },
        { status: 413 }
      );
    }
    if (!document_text || typeof document_text !== "string" || document_text.trim() === "") {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_TEXT", message: "document_text is required" } },
        { status: 400 }
      );
    }
    if (document_text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { ok: false, error: { code: "TEXT_TOO_LARGE", message: `document_text must be under ${MAX_TEXT_LENGTH} characters` } },
        { status: 413 }
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
    console.error("[canary-documents POST] Unhandled error", err instanceof Error ? err.message : err);
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
    console.error("[canary-documents GET] Unhandled error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
