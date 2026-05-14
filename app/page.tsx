"use client";

import { useState } from "react";
import { FileText, Search, Sparkles, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Document {
  id: string;
  title: string;
  source_name: string | null;
  document_text: string;
  created_at: string;
}

interface Analysis {
  id: string;
  document_id: string;
  summary: string;
  key_points: string[];
  topics: string[];
  sentiment: string;
  word_count: number;
  created_at: string;
}

interface SearchResult {
  id: string;
  title: string;
  source_name: string | null;
  document_text: string;
  created_at: string;
  similarity?: number;
  analysis?: {
    summary: string;
    key_points: unknown;
    topics: unknown;
    sentiment: string;
  } | null;
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negative: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
  mixed: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function Home() {
  // Submit form state
  const [title, setTitle] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Results state
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Document[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setLatestAnalysis(null);

    if (!title.trim() || !documentText.trim()) {
      setSubmitError("Title and document text are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/canary-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          document_text: documentText.trim(),
          source_name: sourceName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitError(data.error?.message ?? "Failed to submit document.");
        return;
      }

      const docId = data.document.id;

      // Auto-analyze
      setAnalyzing(true);
      const analyzeRes = await fetch("/api/canary-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId, document_text: documentText.trim() }),
      });
      const analyzeData = await analyzeRes.json();
      if (analyzeRes.ok && analyzeData.ok) {
        setLatestAnalysis(analyzeData.analysis);
      } else {
        setSubmitError(analyzeData.error?.message ?? "Analysis failed.");
      }

      // Reset form
      setTitle("");
      setDocumentText("");
      setSourceName("");

      // Refresh history if visible
      if (historyLoaded) loadHistory();
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
      setAnalyzing(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/canary-documents");
      const data = await res.json();
      if (data.ok) {
        setHistory(data.documents);
        setHistoryLoaded(true);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }

  async function toggleHistory() {
    if (!historyExpanded) {
      setHistoryExpanded(true);
      if (!historyLoaded) await loadHistory();
    } else {
      setHistoryExpanded(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError("");
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const res = await fetch("/api/canary-document-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSearchResults(data.results);
      } else {
        setSearchError(data.error?.message ?? "Search failed.");
      }
    } catch {
      setSearchError("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand" />
            <span className="font-semibold text-lg tracking-tight">DocAnalyze</span>
          </div>
          <span className="text-sm text-muted-foreground hidden sm:block">
            AI-powered document intelligence
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Hero */}
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Extract insight from any document
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Paste your document text — contracts, reports, emails, research papers — and get an
            AI-extracted summary, key points, topics, and sentiment. Every analysis is stored
            and searchable.
          </p>
        </div>

        {/* Two-column layout: Submit + Results */}
        <div className="grid md:grid-cols-[3fr_2fr] gap-8">
          {/* Left: Document submission */}
          <div className="space-y-6">
            <Card className="p-6 border border-border">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                Submit &amp; Analyze Document
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="doc-title" className="text-sm font-medium text-foreground">
                    Document title
                  </label>
                  <Input
                    id="doc-title"
                    placeholder="e.g. Vendor Agreement Q4 2025"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={submitting || analyzing}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="doc-source" className="text-sm font-medium text-foreground">
                    Source file <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Input
                    id="doc-source"
                    placeholder="e.g. vendor-agreement.pdf"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    disabled={submitting || analyzing}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="doc-text" className="text-sm font-medium text-foreground">
                    Document text
                  </label>
                  <Textarea
                    id="doc-text"
                    placeholder="Paste your document content here…"
                    value={documentText}
                    onChange={(e) => setDocumentText(e.target.value)}
                    disabled={submitting || analyzing}
                    rows={8}
                    className="resize-none font-mono text-sm"
                  />
                </div>
                {submitError && (
                  <p className="text-sm text-destructive">{submitError}</p>
                )}
                <Button
                  type="submit"
                  disabled={submitting || analyzing}
                  className="w-full bg-primary text-primary-foreground"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  ) : analyzing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting…</>
                  ) : (
                    "Submit &amp; Extract"
                  )}
                </Button>
              </form>
            </Card>
          </div>

          {/* Right: Analysis result */}
          <div className="space-y-4">
            {latestAnalysis ? (
              <Card className="p-6 border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Extraction Result</h2>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      SENTIMENT_COLOR[latestAnalysis.sentiment] ?? SENTIMENT_COLOR.neutral
                    }`}
                  >
                    {latestAnalysis.sentiment}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Summary</p>
                  <p className="text-sm leading-relaxed">{latestAnalysis.summary}</p>
                </div>
                {Array.isArray(latestAnalysis.key_points) && latestAnalysis.key_points.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Key Points</p>
                    <ul className="space-y-1">
                      {latestAnalysis.key_points.map((pt, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-brand mt-0.5">›</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(latestAnalysis.topics) && latestAnalysis.topics.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Topics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {latestAnalysis.topics.map((t, i) => (
                        <span key={i} className="text-xs px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground border">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{latestAnalysis.word_count} words analyzed</p>
              </Card>
            ) : (
              <Card className="p-6 border border-dashed border-border flex flex-col items-center justify-center text-center min-h-[200px] space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Analysis result will appear here after you submit a document.</p>
              </Card>
            )}
          </div>
        </div>

        {/* Search / RAG */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold">Search Document History</h2>
            <Badge variant="secondary" className="text-xs">RAG</Badge>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search stored documents by topic, keyword, or meaning…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={searching}
              className="flex-1"
            />
            <Button type="submit" disabled={searching} variant="outline">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </form>
          {searchError && <p className="text-sm text-destructive">{searchError}</p>}
          {searchResults !== null && (
            <div className="space-y-3">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents matched your search.</p>
              ) : (
                searchResults.map((r) => (
                  <Card key={r.id} className="p-4 border border-border space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{r.title}</p>
                      {r.similarity !== undefined && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(r.similarity * 100).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                    {r.source_name && (
                      <p className="text-xs text-muted-foreground">{r.source_name}</p>
                    )}
                    {r.analysis?.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{r.analysis.summary}</p>
                    )}
                    {Array.isArray(r.analysis?.topics) && (r.analysis?.topics as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(r.analysis?.topics as string[]).map((t, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-secondary border">{t}</span>
                        ))}
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        {/* Document History */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={toggleHistory}
            className="flex items-center gap-2 text-base font-semibold hover:text-brand transition-colors"
          >
            <FileText className="h-4 w-4" />
            Stored Document History
            {historyExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {historyExpanded && (
            <div className="space-y-3">
              {historyLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents stored yet. Submit one above.</p>
              ) : (
                history.map((doc) => (
                  <Card key={doc.id} className="p-4 border border-border">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{doc.title}</p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {doc.source_name && (
                      <p className="text-xs text-muted-foreground mt-1">{doc.source_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {doc.document_text.slice(0, 120)}{doc.document_text.length > 120 ? "…" : ""}
                    </p>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t mt-16 py-6">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>DocAnalyze &mdash; AI document intelligence</span>
          <span>Powered by Gemini 2 Flash</span>
        </div>
      </footer>
    </main>
  );
}
