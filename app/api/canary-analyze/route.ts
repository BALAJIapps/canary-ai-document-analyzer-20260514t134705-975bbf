import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { canaryDocuments, canaryDocumentAnalyses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { openai } from "@/lib/ai";

export const runtime = "nodejs";

const AI_TEXT_MODEL = process.env.AI_TEXT_MODEL ?? "gemini-2.0-flash";
const AI_EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? "gemini-embedding-001";

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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a document analysis assistant. Analyze the provided document and return a JSON object with these fields:
- summary: A concise 2-3 sentence summary of the document
- key_points: An array of 3-5 key points from the document
- topics: An array of 2-4 main topics covered
- sentiment: One of "positive", "negative", "neutral", or "mixed"

Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Analyze this document:\n\n${textToAnalyze.slice(0, 8000)}`,
          },
        ],
        max_tokens: 1024,
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw);
      analysisResult = {
        summary: typeof parsed.summary === "string" ? parsed.summary : "Document analyzed.",
        key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        sentiment: typeof parsed.sentiment === "string" ? parsed.sentiment : "neutral",
      };
    } catch (aiErr) {
      console.error("[canary-analyze] AI call failed", aiErr);
      return NextResponse.json(
        { ok: false, error: { code: "AI_ERROR", message: "AI analysis failed" } },
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
      console.error("[canary-analyze] Embedding failed (non-fatal)", embErr);
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

    // Store embedding in canary_documents if we got one
    if (embeddingVector && embeddingVector.length > 0) {
      try {
        await db.execute(
          sql`UPDATE canary_documents SET embedding = ${JSON.stringify(embeddingVector)}::vector WHERE id = ${document_id}`
        );
      } catch (vecErr) {
        console.error("[canary-analyze] Vector update failed (non-fatal)", vecErr);
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
    console.error("[canary-analyze POST]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
