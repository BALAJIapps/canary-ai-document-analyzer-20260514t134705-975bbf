import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { canaryDocuments, canaryDocumentAnalyses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { openai } from "@/lib/ai";

export const runtime = "nodejs";

const AI_TEXT_MODEL = process.env.AI_TEXT_MODEL ?? "gemini-2.0-flash";
const AI_EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? "gemini-embedding-001";

const MAX_TEXT_LENGTH = 50000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { document_id, document_text } = body;

    if (!document_id || typeof document_id !== "string") {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_DOCUMENT_ID", message: "document_id is required" } },
        { status: 400 }
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

    // Verify document exists
    const [doc] = await db
      .select()
      .from(canaryDocuments)
      .where(eq(canaryDocuments.id, document_id))
      .limit(1);

    if (!doc) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Document not found" } },
        { status: 404 }
      );
    }

    const textToAnalyze = document_text.trim();
    const wordCount = textToAnalyze.split(/\s+/).filter(Boolean).length;

    // Check AI gateway is configured
    const gatewayUrl = process.env.AI_GATEWAY_URL;
    const gatewayToken = process.env.AI_GATEWAY_TOKEN;
    if (!gatewayUrl || !gatewayToken) {
      return NextResponse.json(
        { ok: false, error: { code: "AI_NOT_CONFIGURED", message: "AI gateway not configured" } },
        { status: 503 }
      );
    }

    console.log(`[canary-analyze] Using model=${AI_TEXT_MODEL} gateway=${gatewayUrl}`);

    // Call AI for structured analysis
    let analysisResult: {
      summary: string;
      key_points: string[];
      topics: string[];
      sentiment: string;
    };

    try {
      const completion = await openai.chat.completions.create({
        model: AI_TEXT_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a document analysis assistant. Analyze the provided document and return ONLY a valid JSON object with no markdown, no code fences, no extra text — just raw JSON with these exact fields:
{
  "summary": "A concise 2-3 sentence summary",
  "key_points": ["point 1", "point 2", "point 3"],
  "topics": ["topic 1", "topic 2"],
  "sentiment": "positive|negative|neutral|mixed"
}`,
          },
          {
            role: "user",
            content: `Analyze this document:\n\n${textToAnalyze.slice(0, 8000)}`,
          },
        ],
        max_tokens: 1024,
      });

      const raw = (completion.choices[0]?.message?.content ?? "{}").trim();
      // Strip markdown code fences if model wraps in them anyway
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch {
        parsed = { summary: cleaned.slice(0, 300) };
      }
      analysisResult = {
        summary: typeof parsed.summary === "string" ? parsed.summary : "Document analyzed.",
        key_points: Array.isArray(parsed.key_points) ? (parsed.key_points as string[]) : [],
        topics: Array.isArray(parsed.topics) ? (parsed.topics as string[]) : [],
        sentiment: typeof parsed.sentiment === "string" ? parsed.sentiment : "neutral",
      };
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const errStatus = (aiErr as { status?: number }).status;
      const errBody = (aiErr as { error?: unknown }).error;
      console.error(`[canary-analyze] AI call failed status=${errStatus} message=${errMsg} body=${JSON.stringify(errBody)}`);
      return NextResponse.json(
        { ok: false, error: { code: "AI_ERROR", message: `AI analysis failed: ${errMsg}` } },
        { status: 502 }
      );
    }

    // Generate embedding for the document text (for RAG search)
    let embeddingVector: number[] | null = null;
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: AI_EMBEDDING_MODEL,
        input: textToAnalyze.slice(0, 8000),
      });
      embeddingVector = embeddingResponse.data[0]?.embedding ?? null;
    } catch (embErr) {
      console.error("[canary-analyze] Embedding failed (non-fatal)", embErr instanceof Error ? embErr.message : embErr);
    }

    // Store the analysis
    const [analysis] = await db
      .insert(canaryDocumentAnalyses)
      .values({
        documentId: document_id,
        summary: analysisResult.summary,
        keyPoints: analysisResult.key_points,
        topics: analysisResult.topics,
        sentiment: analysisResult.sentiment,
        wordCount,
      })
      .returning();

    // Store embedding using parameterized sql tag
    if (embeddingVector && embeddingVector.length > 0) {
      try {
        await db.execute(
          sql`UPDATE canary_documents SET embedding = ${JSON.stringify(embeddingVector)}::vector WHERE id = ${document_id}::uuid`
        );
      } catch (vecErr) {
        console.error("[canary-analyze] Vector update failed (non-fatal)", vecErr instanceof Error ? vecErr.message : vecErr);
      }
    }

    return NextResponse.json({
      ok: true,
      analysis: {
        id: analysis.id,
        document_id: analysis.documentId,
        summary: analysis.summary,
        key_points: analysis.keyPoints,
        topics: analysis.topics,
        sentiment: analysis.sentiment,
        word_count: analysis.wordCount,
        created_at: analysis.createdAt,
      },
    });
  } catch (err) {
    console.error("[canary-analyze POST] Unhandled error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
