"use client";

import { createClient } from "@/lib/supabase/client";
import { buildSeedDemoMeeting } from "@/lib/demo-data";
import {
  DEFAULT_DEPARTMENTS,
  type Meeting,
  type MeetingNote,
  type MeetingQuestion,
  type MeetingTask,
  type OutputLanguage,
  type TranscriptSegment,
  type UserSettings,
} from "@/lib/types";

const DEMO_STORAGE_KEY = "meetnotes_demo_v1";

interface DemoStore {
  meetings: Meeting[];
  standaloneTasks: MeetingTask[];
  settings: UserSettings;
}

function getInitialDemoStore(): DemoStore {
  return {
    meetings: [buildSeedDemoMeeting()],
    standaloneTasks: [],
    settings: {
      departments: [...DEFAULT_DEPARTMENTS],
      default_output_language: "English",
    },
  };
}

function readDemoStore(): DemoStore {
  if (typeof window === "undefined") {
    return getInitialDemoStore();
  }
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const seed = getInitialDemoStore();
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as DemoStore;
  } catch {
    return getInitialDemoStore();
  }
}

function writeDemoStore(store: DemoStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota errors in private browsing
  }
}

async function getSupabaseUserId(): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function isCloudMode(): Promise<boolean> {
  const userId = await getSupabaseUserId();
  return Boolean(userId);
}

export async function fetchSettings(): Promise<UserSettings> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    const { data } = await supabase
      .from("user_settings")
      .select("departments, default_output_language")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      return {
        departments: data.departments ?? [...DEFAULT_DEPARTMENTS],
        default_output_language:
          (data.default_output_language as OutputLanguage) ?? "English",
      };
    }
  }

  return readDemoStore().settings;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    await supabase.from("user_settings").upsert({
      user_id: userId,
      departments: settings.departments,
      default_output_language: settings.default_output_language,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const store = readDemoStore();
  store.settings = settings;
  writeDemoStore(store);
}

export async function fetchMeetings(searchQuery = ""): Promise<Meeting[]> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    let query = supabase
      .from("meetings")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(50);

    if (searchQuery.trim()) {
      query = query.ilike("transcript_text", `%${searchQuery.trim()}%`);
    }

    const { data, error } = await query;
    if (!error && data) {
      return data as Meeting[];
    }
  }

  const store = readDemoStore();
  const q = searchQuery.trim().toLowerCase();
  return store.meetings
    .filter((m) => {
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.transcript_text.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export async function fetchMeetingById(id: string): Promise<Meeting | null> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    const { data: meeting } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!meeting) return null;

    const [segmentsRes, notesRes, tasksRes, questionsRes] = await Promise.all([
      supabase
        .from("transcript_segments")
        .select("*")
        .eq("meeting_id", id)
        .order("start_ms", { ascending: true }),
      supabase
        .from("meeting_notes")
        .select("*")
        .eq("meeting_id", id)
        .order("timestamp_ms", { ascending: true }),
      supabase
        .from("tasks")
        .select("*")
        .eq("meeting_id", id)
        .order("timestamp_ms", { ascending: true }),
      supabase
        .from("questions")
        .select("*")
        .eq("meeting_id", id)
        .order("is_open", { ascending: false })
        .order("timestamp_ms", { ascending: true }),
    ]);

    let audioUrl: string | null = null;
    if (meeting.audio_path) {
      const { data: signed } = await supabase.storage
        .from("meeting-audio")
        .createSignedUrl(meeting.audio_path, 3600);
      audioUrl = signed?.signedUrl ?? null;
    }

    return {
      ...(meeting as Meeting),
      audio_url: audioUrl,
      segments: (segmentsRes.data ?? []) as TranscriptSegment[],
      notes: (notesRes.data ?? []) as MeetingNote[],
      tasks: (tasksRes.data ?? []) as MeetingTask[],
      questions: (questionsRes.data ?? []) as MeetingQuestion[],
    };
  }

  const store = readDemoStore();
  return store.meetings.find((m) => m.id === id) ?? null;
}

export async function saveMeetingRecord(
  meeting: Meeting,
  audioBlob?: Blob | null
): Promise<Meeting> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    let audioPath = meeting.audio_path;
    if (audioBlob && audioBlob.size > 0) {
      const filePath = `${userId}/${meeting.id}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from("meeting-audio")
        .upload(filePath, audioBlob, {
          contentType: audioBlob.type || "audio/webm",
          upsert: true,
        });
      if (!uploadErr) {
        audioPath = filePath;
      }
    }

    const { error: meetingErr } = await supabase.from("meetings").upsert({
      id: meeting.id,
      user_id: userId,
      title: meeting.title,
      started_at: meeting.started_at,
      ended_at: meeting.ended_at,
      status: meeting.status,
      audio_path: audioPath,
      speakers: meeting.speakers,
      summary: meeting.summary,
      decisions: meeting.decisions,
      output_language: meeting.output_language,
      transcript_text: meeting.transcript_text,
      updated_at: new Date().toISOString(),
    });

    if (!meetingErr) {
      // Replace segments, notes, tasks, questions cleanly
      if (meeting.segments && meeting.segments.length > 0) {
        await supabase.from("transcript_segments").delete().eq("meeting_id", meeting.id);
        await supabase.from("transcript_segments").insert(
          meeting.segments.map((s) => ({
            id: s.id,
            meeting_id: meeting.id,
            user_id: userId,
            speaker_id: s.speaker_id,
            speaker_label: s.speaker_label,
            text: s.text,
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            is_final: s.is_final,
          }))
        );
      }

      await supabase.from("meeting_notes").delete().eq("meeting_id", meeting.id);
      if (meeting.notes && meeting.notes.length > 0) {
        await supabase.from("meeting_notes").insert(
          meeting.notes.map((n) => ({
            id: n.id,
            meeting_id: meeting.id,
            user_id: userId,
            department: n.department,
            content: n.content,
            timestamp_ms: n.timestamp_ms,
          }))
        );
      }

      await supabase.from("tasks").delete().eq("meeting_id", meeting.id);
      if (meeting.tasks && meeting.tasks.length > 0) {
        await supabase.from("tasks").insert(
          meeting.tasks.map((t) => ({
            id: t.id,
            meeting_id: meeting.id,
            user_id: userId,
            title: t.title,
            assignee: t.assignee,
            department: t.department,
            deadline: t.deadline,
            status: t.status,
            timestamp_ms: t.timestamp_ms,
          }))
        );
      }

      await supabase.from("questions").delete().eq("meeting_id", meeting.id);
      if (meeting.questions && meeting.questions.length > 0) {
        await supabase.from("questions").insert(
          meeting.questions.map((q) => ({
            id: q.id,
            meeting_id: meeting.id,
            user_id: userId,
            question: q.question,
            answer: q.answer,
            is_open: q.is_open,
            asked_by: q.asked_by,
            timestamp_ms: q.timestamp_ms,
            answered_timestamp_ms: q.answered_timestamp_ms,
          }))
        );
      }
    }

    return { ...meeting, audio_path: audioPath };
  }

  // Local Demo Store
  const store = readDemoStore();
  const idx = store.meetings.findIndex((m) => m.id === meeting.id);
  if (idx >= 0) {
    store.meetings[idx] = meeting;
  } else {
    store.meetings.unshift(meeting);
  }
  writeDemoStore(store);
  return meeting;
}

export async function fetchAllTasks(): Promise<MeetingTask[]> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    const { data } = await supabase
      .from("tasks")
      .select("*, meetings(title, started_at)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (data) {
      return data.map((row) => {
        const joined = row.meetings as { title?: string; started_at?: string } | null;
        return {
          id: row.id,
          meeting_id: row.meeting_id,
          meeting_title: joined?.title,
          meeting_date: joined?.started_at,
          title: row.title,
          assignee: row.assignee,
          department: row.department,
          deadline: row.deadline,
          status: row.status,
          timestamp_ms: row.timestamp_ms ?? 0,
          created_at: row.created_at,
        } satisfies MeetingTask;
      });
    }
  }

  const store = readDemoStore();
  const meetingTasks: MeetingTask[] = store.meetings.flatMap((m) =>
    (m.tasks ?? []).map((t) => ({
      ...t,
      meeting_id: m.id,
      meeting_title: m.title,
      meeting_date: m.started_at,
    }))
  );
  return [...store.standaloneTasks, ...meetingTasks];
}

export async function upsertTask(task: MeetingTask): Promise<void> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    await supabase.from("tasks").upsert({
      id: task.id,
      meeting_id: task.meeting_id ?? null,
      user_id: userId,
      title: task.title,
      assignee: task.assignee,
      department: task.department,
      deadline: task.deadline,
      status: task.status,
      timestamp_ms: task.timestamp_ms ?? 0,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const store = readDemoStore();
  if (task.meeting_id) {
    const m = store.meetings.find((item) => item.id === task.meeting_id);
    if (m) {
      m.tasks = m.tasks ?? [];
      const idx = m.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) m.tasks[idx] = task;
      else m.tasks.unshift(task);
      writeDemoStore(store);
      return;
    }
  }
  const idx = store.standaloneTasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) store.standaloneTasks[idx] = task;
  else store.standaloneTasks.unshift(task);
  writeDemoStore(store);
}

export async function deleteTask(taskId: string): Promise<void> {
  const supabase = createClient();
  const userId = await getSupabaseUserId();

  if (supabase && userId) {
    await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", userId);
    return;
  }

  const store = readDemoStore();
  store.standaloneTasks = store.standaloneTasks.filter((t) => t.id !== taskId);
  for (const m of store.meetings) {
    if (m.tasks) {
      m.tasks = m.tasks.filter((t) => t.id !== taskId);
    }
  }
  writeDemoStore(store);
}
