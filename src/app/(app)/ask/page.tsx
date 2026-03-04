"use client";

import { useState, useRef } from "react";

interface QAPair {
  id: string;
  question: string;
  answer: string;
  sources: string[];
}

const EXAMPLES = [
  "What blockers does BenchPrep have?",
  "How many action items are overdue?",
  "What decisions are pending?",
  "Show me everything assigned to Olga",
  "Which vendors have the most open issues?",
  "What was resolved last week?",
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<QAPair[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(q: string) {
    if (!q.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const { answer, sources } = await res.json();
      setPairs((prev) => [
        { id: crypto.randomUUID(), question: q.trim(), answer, sources },
        ...prev,
      ]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Ask</h1>
      <p className="text-sm text-gray-500 mb-6">
        Ask questions about your projects, blockers, action items, and more.
      </p>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your PM data..."
          disabled={loading}
          className="flex-1 rounded-md border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {/* Example chips */}
      {pairs.length === 0 && !loading && (
        <div className="flex flex-wrap gap-2 mb-6">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setQuestion(ex); ask(ex); }}
              className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-800 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm text-blue-800">Searching your data...</span>
        </div>
      )}

      {/* Q&A pairs */}
      <div className="space-y-4">
        {pairs.map((pair) => (
          <div key={pair.id} className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            {/* Question */}
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-900">{pair.question}</p>
            </div>
            {/* Answer */}
            <div className="px-4 py-3">
              <div className="text-sm text-gray-800 prose-sm">
                <SimpleMarkdown text={pair.answer} />
              </div>
              {pair.sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    Sources: {pair.sources.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Minimal markdown renderer — bold, bullets, line breaks */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBullet = /^[-*]\s/.test(line.trim());

    if (isBullet) {
      // Collect consecutive bullets
      const bullets: string[] = [];
      let j = i;
      while (j < lines.length && /^[-*]\s/.test(lines[j].trim())) {
        bullets.push(lines[j].trim().replace(/^[-*]\s/, ""));
        j++;
      }
      elements.push(
        <ul key={i} className="list-disc pl-5 space-y-1 my-1">
          {bullets.map((b, idx) => (
            <li key={idx}><BoldText text={b} /></li>
          ))}
        </ul>
      );
      i = j - 1;
    } else if (line.trim() === "") {
      elements.push(<br key={i} />);
    } else {
      elements.push(
        <p key={i} className="my-1"><BoldText text={line} /></p>
      );
    }
  }

  return <>{elements}</>;
}

function BoldText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
