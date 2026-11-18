"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquareText, Send, Sparkles } from "lucide-react";
import { fetchMeetings } from "@/lib/storage/data-client";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    meeting_title: string;
    meeting_date: string;
    meeting_id?: string;
  }>;
}

const SUGGESTIONS = [
  "Ali ko kya kaam mila?",
  "Finance ke open tasks dikhao",
  "Pichli meeting ka summary do",
  "Kya koi open question baqi hai?",
];

export default function AskAIPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const askQuestion = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: q,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Load local/demo meetings in case user is in Demo Mode
      const localMeetings = await fetchMeetings();
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          meetings: localMeetings.slice(0, 10),
        }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer || data.error || "Unable to answer right now.",
          citations: data.citations ?? [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Network error while asking AI. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] md:h-[calc(100vh-7rem)]">
      <div className="mb-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          Ask AI (Meeting Memory)
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ask in English, Urdu, or Roman Urdu. Answers are grounded strictly in
          your saved meetings.
        </p>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 space-y-4 dark:border-slate-800 dark:bg-slate-900">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquareText className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Try asking a question about your meetings:
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => askQuestion(s)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white"
                    : "max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                }
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700 flex flex-wrap gap-1.5">
                    {m.citations.map((c, idx) =>
                      c.meeting_id ? (
                        <Link
                          key={idx}
                          href={`/meetings/${c.meeting_id}`}
                          className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:underline dark:bg-slate-900 dark:text-blue-400"
                        >
                          {c.meeting_title} ({c.meeting_date})
                        </Link>
                      ) : (
                        <span
                          key={idx}
                          className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {c.meeting_title} ({c.meeting_date})
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching meetings...
          </div>
        )}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          askQuestion(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask: Ali ko kya kaam mila? / Finance ke open tasks..."
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
