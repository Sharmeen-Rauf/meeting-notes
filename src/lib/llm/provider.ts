import { GoogleGenAI } from "@google/genai";
import type {
  Meeting,
  MeetingNote,
  MeetingQuestion,
  MeetingTask,
  OutputLanguage,
  TranscriptSegment,
} from "@/lib/types";
import {
  AskAIResponseSchema,
  MeetingAnalysisSchema,
  type AskAIResponse,
  type MeetingAnalysisResult,
} from "./schemas";
import { buildMeetingAnalysisPrompt, loadPrompt } from "./prompts";
import { buildDemoAnalysis, buildDemoAskAIResponse } from "@/lib/demo-data";

export interface AnalyzeMeetingInput {
  segments: TranscriptSegment[];
  departments: string[];
  outputLanguage: OutputLanguage;
  existingNotes?: MeetingNote[];
  existingTasks?: MeetingTask[];
  existingQuestions?: MeetingQuestion[];
}

export interface AskAIInput {
  question: string;
  meetings: Meeting[];
}

export interface LLMProvider {
  readonly name: string;
  analyzeMeeting(input: AnalyzeMeetingInput): Promise<MeetingAnalysisResult>;
  askMeetings(input: AskAIInput): Promise<AskAIResponse>;
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return trimmed;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = process.env.GEMINI_MODEL || "gemini-2.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async analyzeMeeting(input: AnalyzeMeetingInput): Promise<MeetingAnalysisResult> {
    if (input.segments.length === 0) {
      return { summary: "", decisions: [], notes: [], tasks: [], questions: [] };
    }

    const systemInstruction = buildMeetingAnalysisPrompt(
      input.departments,
      input.outputLanguage
    );

    const transcriptPayload = input.segments.map((s) => ({
      timestamp_ms: s.start_ms,
      speaker: s.speaker_label,
      text: s.text,
    }));

    const userContent = JSON.stringify({
      transcript: transcriptPayload,
      existing_notes: (input.existingNotes ?? []).map((n) => ({
        id: n.id,
        department: n.department,
        content: n.content,
        timestamp_ms: n.timestamp_ms,
      })),
      existing_tasks: (input.existingTasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        assignee: t.assignee,
        department: t.department,
        deadline: t.deadline,
        status: t.status,
      })),
      existing_questions: (input.existingQuestions ?? []).map((q) => ({
        id: q.id,
        question: q.question,
        is_open: q.is_open,
        answer: q.answer,
      })),
    });

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: userContent,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const rawText = response.text ?? "{}";
    const parsed = JSON.parse(extractJsonText(rawText));
    return MeetingAnalysisSchema.parse(parsed);
  }

  async askMeetings(input: AskAIInput): Promise<AskAIResponse> {
    const systemInstruction =
      loadPrompt("ask-ai.txt") +
      `\n\nReturn ONLY a valid JSON object with keys: "answer" (string, markdown allowed) and "citations" (array of { "meeting_title": string, "meeting_date": string, "meeting_id": string }).`;

    const context = input.meetings.map((m) => ({
      meeting_id: m.id,
      title: m.title,
      date: m.started_at,
      summary: m.summary,
      decisions: m.decisions,
      notes: (m.notes ?? []).map((n) => ({
        department: n.department,
        content: n.content,
        timestamp_ms: n.timestamp_ms,
      })),
      tasks: (m.tasks ?? []).map((t) => ({
        title: t.title,
        assignee: t.assignee,
        department: t.department,
        deadline: t.deadline,
        status: t.status,
      })),
      questions: (m.questions ?? []).map((q) => ({
        question: q.question,
        asked_by: q.asked_by,
        is_open: q.is_open,
        answer: q.answer,
      })),
      transcript_excerpt: m.transcript_text.slice(0, 4000),
    }));

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: JSON.stringify({
        user_question: input.question,
        meetings: context,
      }),
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const rawText = response.text ?? "{}";
    const parsed = JSON.parse(extractJsonText(rawText));
    return AskAIResponseSchema.parse(parsed);
  }
}

class DemoFallbackProvider implements LLMProvider {
  readonly name = "demo-fallback";

  async analyzeMeeting(input: AnalyzeMeetingInput): Promise<MeetingAnalysisResult> {
    return buildDemoAnalysis(input.segments, input.outputLanguage);
  }

  async askMeetings(input: AskAIInput): Promise<AskAIResponse> {
    return buildDemoAskAIResponse(input.question, input.meetings);
  }
}

export function getLLMProvider(): LLMProvider {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey) {
    return new GeminiProvider(apiKey);
  }
  return new DemoFallbackProvider();
}
