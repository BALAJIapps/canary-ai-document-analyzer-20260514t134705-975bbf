import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { canaryDocuments, canaryDocumentAnalyses } from "@/db/schema";
import { sql, eq, desc } from "drizzle-orm";
import { openai } from "@/lib/ai";

export const runtime = "nodejs";

const AI_EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? "gemini-embedding-001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string" || query.trim() === "") {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_QUERY", message: "query is required" } },
        { status: 400 }
      );
    }

    const queryText = query.trim();

    // Try vector/semantic search first
    let results: Array<{
      id: string;
      title: string;
      source_name: string | null;
      document_text: string;
      created_at: Date;
      similarity?: number;
      analysis?: { summary: string; key_points: unknown; topics: unknown; sentiment: string } | null;
    }> = [];

    const gatewayToken = process.env.AI_GATEWAY_TOKEN;

    if (gatewayToken) {
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: AI_EMBEDDING_MODEL,
          input: queryText,
        });
        const queryEmbedding = embeddingResponse.data[0]?.embedding;

        if (queryEmbedding && queryEmbedding.length > 0) {
          // Exact cosine similarity scan (no ANN index on vector(3072))
          const vectorResults = await db.execute(
            sql`
              SELECT
                d.id,
                d.title,
                d.source_name,
                d.document_text,
                d.created_at,
                1 - (d.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
              FROM canary_documents d
              WHERE d.embedding IS NOT NULL
              ORDER BY d.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
              LIMIT 10
            `
          );

          results = (vectorResults.rows as Array<{
            id: string;
            title: string;
            source_name: string | null;
            document_text: string;
            created_at: Date;
            similarity: number;
          }>).map((r) => ({
            id: r.id,
            title: r.title,
            source_name: r.source_name,
            document_text: r.document_text,
            created_at: r.created_at,
            similarity: Number(r.similarity),
          }));
        }
      } catch (embErr) {
        console.error("[canary-document-search] Vector search failed, falling back", embErr);
      }
    }

    // If no vector results, fall back to keyword search
    if (results.length === 0) {
      const kwResults = await db
        .select()
        .from(canaryDocuments)
        .orderBy(desc(canaryDocuments.createdAt))
        .limit(10);

      results = kwResults
        .filter(
          (d) =>
            d.title.toLowerCase().includes(queryText.toLowerCase()) ||
            d.documentText.toLowerCase().includes(queryText.toLowerCase())
        )
        .map((d) => ({
          id: d.id,
          title: d.title,
          source_name: d.sourceName,
          document_text: d.documentText,
          created_at: d.createdAt,
        }));

      // If still no results from keyword, return recent docs
      if (results.length === 0) {
        results = kwResults.map((d) => ({
          id: d.id,
          title: d.title,
          source_name: d.sourceName,
          document_text: d.documentText,
          created_at: d.createdAt,
        }));
      }
    }

    // Enrich results with analysis data
    const enriched = await Promise.all(
      results.slice(0, 5).map(async (r) => {
        try {
          const [analysis] = await db
            .select()
            .from(canaryDocumentAnalyses)
            .where(eq(canaryDocumentAnalyses.documentId, r.id))
            .orderBy(desc(canaryDocumentAnalyses.createdAt))
            .limit(1);
          return {
            ...r,
            analysis: analysis
              ? {
                  summary: analysis.summary,
                  key_points: analysis.keyPoints,
                  topics: analysis.topics,
                  sentiment: analysis.sentiment,
                }
              : null,
          };
        } catch {
          return { ...r, analysis: null };
        }
      })
    );

    return NextResponse.json({
      ok: true,
      query: queryText,
      results: enriched,
      total: enriched.length,
    });
  } catch (err) {
    console.error("[canary-document-search POST]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
