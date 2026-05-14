import type { Metadata } from "next";
import { Toaster } from "@/components/providers/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocAnalyze — AI Document Analyzer",
  description: "Submit any document and let AI extract summaries, key points, and topics. Search your analysis history with semantic RAG search.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
