"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronRight, FileText, Search } from "lucide-react";
import { fetchMeetings } from "@/lib/storage/data-client";
import type { Meeting } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function MeetingsHistoryPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const list = await fetchMeetings(query);
      if (!cancelled) {
        setMeetings(list);
        setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Meeting History</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Search past meetings, transcripts, notes, and decisions.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Loading meetings...
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <FileText className="h-8 w-8 mx-auto text-slate-400 mb-2" />
          <p className="text-sm font-medium">No meetings found</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Start a new meeting or run Demo Mode from the Record tab.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Link
              key={m.id}
              href={`/meetings/${m.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <h2 className="font-semibold text-base truncate">{m.title}</h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDate(m.started_at)}</span>
                    <span>•</span>
                    <span>{m.output_language}</span>
                  </div>
                  {m.summary && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 pt-1">
                      {m.summary}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
