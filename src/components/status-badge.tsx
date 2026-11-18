"use client";

import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/types";

const STATUS_STYLES: Record<
  ConnectionStatus,
  { label: string; dot: string; badge: string }
> = {
  idle: {
    label: "Ready",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  recording: {
    label: "Recording",
    dot: "bg-red-500 animate-pulse",
    badge: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  },
  connected: {
    label: "Connected",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  reconnecting: {
    label: "Reconnecting",
    dot: "bg-amber-500 animate-ping",
    badge:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  processing: {
    label: "Processing",
    dot: "bg-blue-500 animate-pulse",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ConnectionStatus;
  className?: string;
}) {
  const cfg = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        cfg.badge,
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
