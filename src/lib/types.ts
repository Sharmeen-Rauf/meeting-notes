export const DEFAULT_DEPARTMENTS = [
  "Finance",
  "HR",
  "IT",
  "Sales",
  "Operations",
  "Marketing",
  "Admin",
  "General",
] as const;

export type OutputLanguage = "English" | "Urdu" | "Roman Urdu";

export type ConnectionStatus =
  | "idle"
  | "recording"
  | "connected"
  | "reconnecting"
  | "processing";

export interface TranscriptSegment {
  id: string;
  meeting_id?: string;
  speaker_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
  is_final: boolean;
}

export interface MeetingNote {
  id: string;
  meeting_id?: string;
  department: string;
  content: string;
  timestamp_ms: number;
  updated_at?: string;
}

export interface MeetingTask {
  id: string;
  meeting_id?: string | null;
  meeting_title?: string;
  meeting_date?: string;
  title: string;
  assignee: string;
  department: string;
  deadline: string | null;
  status: "Pending" | "Done";
  timestamp_ms: number;
  created_at?: string;
}

export interface MeetingQuestion {
  id: string;
  meeting_id?: string;
  question: string;
  answer: string | null;
  is_open: boolean;
  asked_by: string;
  timestamp_ms: number;
  answered_timestamp_ms: number | null;
}

export interface Meeting {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  status: "recording" | "processing" | "completed";
  audio_path: string | null;
  audio_url?: string | null;
  speakers: Record<string, string>;
  summary: string;
  decisions: string[];
  output_language: OutputLanguage;
  transcript_text: string;
  segments?: TranscriptSegment[];
  notes?: MeetingNote[];
  tasks?: MeetingTask[];
  questions?: MeetingQuestion[];
}

export interface UserSettings {
  departments: string[];
  default_output_language: OutputLanguage;
}
