"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  HelpCircle,
  Mic,
  Play,
  Sparkles,
  Square,
  Users,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DEMO_MEETING_SPEAKERS, DEMO_TRANSCRIPT_LINES } from "@/lib/demo-data";
import {
  fetchSettings,
  saveMeetingRecord,
} from "@/lib/storage/data-client";
import type {
  ConnectionStatus,
  Meeting,
  MeetingNote,
  MeetingQuestion,
  MeetingTask,
  OutputLanguage,
  TranscriptSegment,
} from "@/lib/types";
import { DEFAULT_DEPARTMENTS } from "@/lib/types";
import { cn, formatMs } from "@/lib/utils";
import type { MeetingAnalysisResult } from "@/lib/llm/schemas";

type ActiveTab = "transcript" | "notes" | "tasks" | "questions";
type SpeechLanguage = "multi" | "ur" | "en";

function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) return buffer;
  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function mergeAnalysis(
  analysis: MeetingAnalysisResult,
  prevNotes: MeetingNote[],
  prevTasks: MeetingTask[],
  prevQuestions: MeetingQuestion[]
): {
  notes: MeetingNote[];
  tasks: MeetingTask[];
  questions: MeetingQuestion[];
} {
  const noteMap = new Map(prevNotes.map((n) => [n.id, n]));
  const nextNotes: MeetingNote[] = [];
  for (const item of analysis.notes) {
    const id = item.existing_id && noteMap.has(item.existing_id)
      ? item.existing_id
      : crypto.randomUUID();
    nextNotes.push({
      id,
      department: item.department,
      content: item.content,
      timestamp_ms: item.timestamp_ms,
      updated_at: new Date().toISOString(),
    });
  }

  const taskMap = new Map(prevTasks.map((t) => [t.id, t]));
  const nextTasks: MeetingTask[] = [];
  for (const item of analysis.tasks) {
    const id = item.existing_id && taskMap.has(item.existing_id)
      ? item.existing_id
      : crypto.randomUUID();
    nextTasks.push({
      id,
      title: item.title,
      assignee: item.assignee,
      department: item.department,
      deadline: item.deadline ?? null,
      status: item.status,
      timestamp_ms: item.timestamp_ms,
      created_at: taskMap.get(id)?.created_at ?? new Date().toISOString(),
    });
  }

  const qMap = new Map(prevQuestions.map((q) => [q.id, q]));
  const nextQuestions: MeetingQuestion[] = [];
  for (const item of analysis.questions) {
    const id = item.existing_id && qMap.has(item.existing_id)
      ? item.existing_id
      : crypto.randomUUID();
    nextQuestions.push({
      id,
      question: item.question,
      asked_by: item.asked_by,
      is_open: item.is_open,
      answer: item.answer ?? null,
      timestamp_ms: item.timestamp_ms,
      answered_timestamp_ms: item.answered_timestamp_ms ?? null,
    });
  }

  return { notes: nextNotes, tasks: nextTasks, questions: nextQuestions };
}

export default function RecordMeetingPage() {
  const router = useRouter();

  const [meetingTitle, setMeetingTitle] = useState("New Meeting");
  const [consentAck, setConsentAck] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("transcript");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [departments, setDepartments] = useState<string[]>([...DEFAULT_DEPARTMENTS]);
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>("English");
  const [speechLanguage, setSpeechLanguage] = useState<SpeechLanguage>("multi");
  const [micLevel, setMicLevel] = useState(0);

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>("");
  const [speakers, setSpeakers] = useState<Record<string, string>>({});
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState("");

  const [summary, setSummary] = useState("");
  const [decisions, setDecisions] = useState<string[]>([]);
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [questions, setQuestions] = useState<MeetingQuestion[]>([]);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);

  // Refs for live recording & cleanup
  const meetingIdRef = useRef<string>("");
  const startedAtRef = useRef<string>("");
  const startPerfRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Latest state refs for 30s interval
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const speakersRef = useRef(speakers);
  speakersRef.current = speakers;

  useEffect(() => {
    setMeetingTitle(
      `Meeting — ${new Date().toLocaleDateString("en-PK", { month: "short", day: "numeric" })}`
    );
    fetchSettings().then((s) => {
      setDepartments(s.departments);
      setOutputLanguage(s.default_output_language);
    });
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
      wakeLockRef.current = null;
    } catch {
      // Ignore
    }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Wake Lock may fail on unsupported browsers or low battery
    }
  }, []);

  const runAnalysis = useCallback(
    async (currentSegments: TranscriptSegment[]) => {
      if (currentSegments.length === 0) return null;
      try {
        const res = await fetch("/api/notes/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segments: currentSegments,
            departments,
            outputLanguage,
            existingNotes: notesRef.current,
            existingTasks: tasksRef.current,
            existingQuestions: questionsRef.current,
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          analysis: MeetingAnalysisResult;
        };
        const merged = mergeAnalysis(
          data.analysis,
          notesRef.current,
          tasksRef.current,
          questionsRef.current
        );
        setSummary(data.analysis.summary);
        setDecisions(data.analysis.decisions);
        setNotes(merged.notes);
        setTasks(merged.tasks);
        setQuestions(merged.questions);
        setLastAnalyzedAt(new Date().toLocaleTimeString());
        return {
          summary: data.analysis.summary,
          decisions: data.analysis.decisions,
          ...merged,
        };
      } catch {
        return null;
      }
    },
    [departments, outputLanguage]
  );

  const connectDeepgram = useCallback(async () => {
    if (!isRecordingRef.current) return;
    try {
      const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        throw new Error(errData.error || "Unable to get Deepgram token");
      }
      const { token, auth_type } = (await tokenRes.json()) as {
        token: string;
        auth_type?: "bearer" | "token";
      };

      const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=${speechLanguage}&encoding=linear16&sample_rate=16000&channels=1&diarize=true&smart_format=true&interim_results=true&punctuate=true`;
      const ws = new WebSocket(dgUrl, [auth_type ?? "bearer", token]);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("connected");
        setErrorMsg(null);
        if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
        keepAliveTimerRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 8000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const alt = payload?.channel?.alternatives?.[0];
          const transcript: string = alt?.transcript ?? "";
          if (!transcript.trim()) return;

          const words = alt?.words ?? [];
          const speakerIdx = words[0]?.speaker ?? 0;
          const speakerId = `Speaker ${speakerIdx}`;
          const startMs = Math.round((payload.start ?? 0) * 1000);
          const endMs = Math.round(
            ((payload.start ?? 0) + (payload.duration ?? 0)) * 1000
          );

          if (payload.is_final) {
            setInterimText("");
            setSpeakers((prev) => {
              if (prev[speakerId]) return prev;
              return { ...prev, [speakerId]: speakerId };
            });
            const label = speakersRef.current[speakerId] ?? speakerId;
            setSegments((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                speaker_id: speakerId,
                speaker_label: label,
                text: transcript.trim(),
                start_ms: startMs,
                end_ms: endMs,
                is_final: true,
              },
            ]);
          } else {
            setInterimText(transcript);
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (isRecordingRef.current) {
          setStatus("reconnecting");
          const delay = Math.min(
            10_000,
            1000 * Math.pow(2, reconnectAttemptRef.current)
          );
          reconnectAttemptRef.current += 1;
          setTimeout(() => {
            if (isRecordingRef.current) {
              connectDeepgram();
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Deepgram connection error"
      );
      setStatus("recording");
    }
  }, [speechLanguage]);

  const startLiveMeeting = async () => {
    setErrorMsg(null);
    meetingIdRef.current = crypto.randomUUID();
    startedAtRef.current = new Date().toISOString();
    startPerfRef.current = Date.now();
    audioChunksRef.current = [];
    setSegments([]);
    setNotes([]);
    setTasks([]);
    setQuestions([]);
    setSummary("");
    setDecisions([]);
    setSpeakers({});
    setElapsedMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      isRecordingRef.current = true;
      setStatus("recording");
      await acquireWakeLock();

      // 1. Connect Deepgram first, then stream raw 16kHz linear16 PCM (headerless, reliable on Chrome + Safari)
      await connectDeepgram();

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return;
        const input = event.inputBuffer.getChannelData(0);

        // Compute simple RMS mic level (0-100) for UI feedback
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);
        setMicLevel(Math.min(100, Math.round(rms * 400)));

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const downsampled = downsampleBuffer(input, audioCtx.sampleRate, 16000);
          const pcm = floatTo16BitPCM(downsampled);
          wsRef.current.send(pcm);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      // 2. MediaRecorder runs separately only to save the full audio file
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.start(1000);

      clockTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startPerfRef.current);
      }, 1000);

      analyzeTimerRef.current = setInterval(() => {
        runAnalysis(segmentsRef.current);
      }, 30_000);
    } catch (err) {
      isRecordingRef.current = false;
      setStatus("idle");
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Microphone permission denied or unavailable."
      );
    }
  };

  const startDemoMeeting = () => {
    setErrorMsg(null);
    meetingIdRef.current = crypto.randomUUID();
    startedAtRef.current = new Date().toISOString();
    startPerfRef.current = Date.now();
    audioChunksRef.current = [];
    setSegments([]);
    setNotes([]);
    setTasks([]);
    setQuestions([]);
    setSummary("");
    setDecisions([]);
    setSpeakers(DEMO_MEETING_SPEAKERS);
    setMeetingTitle("Weekly Operations & Finance Sync (Demo)");
    setElapsedMs(0);
    setIsDemoRunning(true);
    isRecordingRef.current = true;
    setStatus("connected");

    let lineIdx = 0;

    clockTimerRef.current = setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);

    // Emit one demo transcript line every 1.8s so the user can watch live transcription + notes
    demoTimerRef.current = setInterval(() => {
      if (lineIdx >= DEMO_TRANSCRIPT_LINES.length) {
        if (demoTimerRef.current) clearInterval(demoTimerRef.current);
        return;
      }
      const line = DEMO_TRANSCRIPT_LINES[lineIdx];
      lineIdx += 1;
      const newSeg: TranscriptSegment = {
        id: crypto.randomUUID(),
        speaker_id: line.speaker_id,
        speaker_label: speakersRef.current[line.speaker_id] ?? line.speaker_label,
        text: line.text,
        start_ms: line.start_ms,
        end_ms: line.end_ms,
        is_final: true,
      };
      setSegments((prev) => {
        const next = [...prev, newSeg];
        if (next.length === 4 || next.length === 8 || next.length === DEMO_TRANSCRIPT_LINES.length) {
          runAnalysis(next);
        }
        return next;
      });
    }, 1800);

    analyzeTimerRef.current = setInterval(() => {
      runAnalysis(segmentsRef.current);
    }, 30_000);
  };

  const endMeeting = async () => {
    isRecordingRef.current = false;
    setIsDemoRunning(false);
    setStatus("processing");

    if (demoTimerRef.current) clearInterval(demoTimerRef.current);
    if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current);
    if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
    setMicLevel(0);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioCtxRef.current) {
      await audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
        }
      } catch {
        // Ignore
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    await releaseWakeLock();

    const finalAnalysis = await runAnalysis(segmentsRef.current);
    const finalNotes = finalAnalysis?.notes ?? notesRef.current;
    const finalTasks = finalAnalysis?.tasks ?? tasksRef.current;
    const finalQuestions = finalAnalysis?.questions ?? questionsRef.current;

    const audioBlob =
      audioChunksRef.current.length > 0
        ? new Blob(audioChunksRef.current, { type: "audio/webm" })
        : null;

    const meetingRecord: Meeting = {
      id: meetingIdRef.current,
      title: meetingTitle.trim() || "Untitled Meeting",
      started_at: startedAtRef.current,
      ended_at: new Date().toISOString(),
      status: "completed",
      audio_path: null,
      speakers: speakersRef.current,
      summary: finalAnalysis?.summary ?? summary,
      decisions: finalAnalysis?.decisions ?? decisions,
      output_language: outputLanguage,
      transcript_text: segmentsRef.current
        .map((s) => `${s.speaker_label}: ${s.text}`)
        .join("\n"),
      segments: segmentsRef.current,
      notes: finalNotes,
      tasks: finalTasks,
      questions: finalQuestions,
    };

    const saved = await saveMeetingRecord(meetingRecord, audioBlob);
    setStatus("idle");
    router.push(`/meetings/${saved.id}`);
  };

  useEffect(() => {
    return () => {
      if (demoTimerRef.current) clearInterval(demoTimerRef.current);
      if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current);
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
      if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
      processorRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  const handleRenameSpeaker = (speakerId: string) => {
    const nextName = speakerDraft.trim();
    if (!nextName) {
      setEditingSpeakerId(null);
      return;
    }
    setSpeakers((prev) => ({ ...prev, [speakerId]: nextName }));
    setSegments((prev) =>
      prev.map((seg) =>
        seg.speaker_id === speakerId ? { ...seg, speaker_label: nextName } : seg
      )
    );
    setEditingSpeakerId(null);
  };

  const isActive = status !== "idle";
  const openQuestionsCount = questions.filter((q) => q.is_open).length;

  return (
    <div className="space-y-4">
      {/* Consent Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold">
                Sab participants ko batayein ke meeting record ho rahi hai
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                Please inform all participants before starting recording.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={consentAck}
              onChange={(e) => setConsentAck(e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600"
            />
            Confirmed
          </label>
        </div>
      </div>

      {/* Meeting Control Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Meeting Title
            </label>
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              disabled={status === "processing"}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              placeholder="e.g. Weekly Finance & Ops Sync"
            />
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-mono font-semibold dark:bg-slate-800">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              {formatMs(elapsedMs)}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {!isActive ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-500 dark:text-slate-400">
                Speech Language:
              </span>
              <select
                value={speechLanguage}
                onChange={(e) =>
                  setSpeechLanguage(e.target.value as SpeechLanguage)
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-medium dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="multi">Mixed (Urdu/Hindi + English)</option>
                <option value="ur">Urdu Only (اردو)</option>
                <option value="en">English Only</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!consentAck}
                onClick={startLiveMeeting}
                className="flex items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                <Mic className="h-5 w-5" />
                Start Meeting
              </button>

              <button
                type="button"
                disabled={!consentAck}
                onClick={startDemoMeeting}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Run Demo Meeting (No Mic)
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {!isDemoRunning && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                  Mic Level
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-100"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>
            )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <span>
                {isDemoRunning
                  ? "Demo Mode streaming Urdu/English meeting..."
                  : "Listening (Urdu + English)..."}
                {lastAnalyzedAt ? ` • Notes updated ${lastAnalyzedAt}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => runAnalysis(segments)}
                disabled={segments.length === 0 || status === "processing"}
                className="flex-1 sm:flex-initial rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Refresh Notes
              </button>
              <button
                type="button"
                onClick={endMeeting}
                disabled={status === "processing"}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Square className="h-4 w-4 fill-current" />
                {status === "processing" ? "Finalizing..." : "End Meeting"}
              </button>
            </div>
          </div>
          </div>
        )}
      </section>

      {/* Speaker Rename Bar */}
      {Object.keys(speakers).length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            <Users className="h-3.5 w-3.5" />
            <span>Speakers (tap to rename)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(speakers).map(([id, label]) =>
              editingSpeakerId === id ? (
                <form
                  key={id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRenameSpeaker(id);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={speakerDraft}
                    onChange={(e) => setSpeakerDraft(e.target.value)}
                    onBlur={() => handleRenameSpeaker(id)}
                    placeholder="e.g. Ali - Finance"
                    className="rounded-lg border border-blue-500 bg-white px-2 py-1 text-xs dark:bg-slate-800"
                  />
                </form>
              ) : (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setEditingSpeakerId(id);
                    setSpeakerDraft(label);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span>{label}</span>
                  <Edit3 className="h-3 w-3 opacity-60" />
                </button>
              )
            )}
          </div>
        </section>
      )}

      {/* Tabs for Live Transcript / Notes / Tasks / Questions */}
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/80">
        {(
          [
            { id: "transcript", label: `Transcript (${segments.length})` },
            { id: "notes", label: `Notes (${notes.length})` },
            { id: "tasks", label: `Tasks (${tasks.length})` },
            {
              id: "questions",
              label: `Questions (${openQuestionsCount} open)`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg py-2 px-1 text-xs font-semibold transition",
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 min-h-[280px] dark:border-slate-800 dark:bg-slate-900">
        {activeTab === "transcript" && (
          <div className="space-y-3">
            {segments.length === 0 && !interimText ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
                Press <strong>Start Meeting</strong> or{" "}
                <strong>Run Demo Meeting</strong> to see live Urdu/English
                transcription here.
              </p>
            ) : (
              <>
                {segments.map((seg) => (
                  <div key={seg.id} className="flex gap-3 text-sm">
                    <span className="shrink-0 font-mono text-xs text-slate-400 pt-0.5">
                      {formatMs(seg.start_ms)}
                    </span>
                    <div>
                      <span className="font-semibold text-blue-600 dark:text-blue-400 mr-2">
                        {seg.speaker_label}:
                      </span>
                      <span className="text-slate-800 dark:text-slate-200">
                        {seg.text}
                      </span>
                    </div>
                  </div>
                ))}
                {interimText && (
                  <div className="flex gap-3 text-sm italic text-slate-400">
                    <span className="shrink-0 font-mono text-xs">...</span>
                    <span>{interimText}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-4">
            {summary && (
              <div className="rounded-xl bg-blue-50/70 p-3 text-sm text-slate-800 dark:bg-blue-950/30 dark:text-slate-200">
                <p className="font-semibold text-xs uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-1">
                  Live Summary
                </p>
                <p>{summary}</p>
              </div>
            )}
            {notes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
                Department notes auto-generate every ~30 seconds during the
                meeting.
              </p>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {n.department}
                    </span>
                    <span className="font-mono text-slate-400">
                      {formatMs(n.timestamp_ms)}
                    </span>
                  </div>
                  <p className="text-sm">{n.content}</p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="space-y-2.5">
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
                No tasks extracted yet.
              </p>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t.assignee} • {t.department}
                      {t.deadline ? ` • Due: ${t.deadline}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {t.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "questions" && (
          <div className="space-y-2.5">
            {questions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
                No questions detected yet.
              </p>
            ) : (
              questions.map((q) => (
                <div
                  key={q.id}
                  className={cn(
                    "rounded-xl border p-3",
                    q.is_open
                      ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30"
                      : "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {q.is_open ? (
                        <>
                          <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-amber-700 dark:text-amber-400">
                            OPEN QUESTION
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700 dark:text-emerald-400">
                            ANSWERED
                          </span>
                        </>
                      )}
                    </span>
                    <span className="font-mono text-slate-400">
                      {q.asked_by} • {formatMs(q.timestamp_ms)}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{q.question}</p>
                  {q.answer && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      Answer: {q.answer}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
