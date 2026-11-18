import type {
  Meeting,
  MeetingNote,
  MeetingQuestion,
  MeetingTask,
  OutputLanguage,
  TranscriptSegment,
} from "./types";
import type { AskAIResponse, MeetingAnalysisResult } from "./llm/schemas";

export interface DemoTranscriptLine {
  speaker_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export const DEMO_MEETING_SPEAKERS: Record<string, string> = {
  "Speaker 0": "Ali - Finance",
  "Speaker 1": "Sara - Operations",
  "Speaker 2": "Bilal - IT",
  "Speaker 3": "Hina - Sales",
};

export const DEMO_TRANSCRIPT_LINES: DemoTranscriptLine[] = [
  {
    speaker_id: "Speaker 0",
    speaker_label: "Ali - Finance",
    text: "Assalam-o-Alaikum everyone. Chalein aaj ki weekly sync start karte hain. Sabse pehle October ke pending vendor invoices ka status dekh lete hain.",
    start_ms: 2000,
    end_ms: 9000,
  },
  {
    speaker_id: "Speaker 1",
    speaker_label: "Sara - Operations",
    text: "Walaikum Assalam Ali. Operations side se teen logistics vendors ki payment abhi pending hai. Unhon ne kal reminder bhi bheja tha.",
    start_ms: 10000,
    end_ms: 17000,
  },
  {
    speaker_id: "Speaker 0",
    speaker_label: "Ali - Finance",
    text: "Theek hai, main aaj shaam 5 baje tak teeno logistics invoices clear kar dunga. Sara, kya aap mujhe approved PO copies email kar sakti hain?",
    start_ms: 18000,
    end_ms: 26000,
  },
  {
    speaker_id: "Speaker 1",
    speaker_label: "Sara - Operations",
    text: "Ji bilkul, main abhi meeting ke foran baad PO copies bhej dungi.",
    start_ms: 27000,
    end_ms: 31000,
  },
  {
    speaker_id: "Speaker 2",
    speaker_label: "Bilal - IT",
    text: "IT side se ek update hai: office Wi-Fi router aur backup internet link kal raat upgrade ho gaya hai. Ab speed stable hai. Lekin server room ke UPS battery backup ka kya scene hai?",
    start_ms: 33000,
    end_ms: 44000,
  },
  {
    speaker_id: "Speaker 1",
    speaker_label: "Sara - Operations",
    text: "UPS battery ka quote abhi tak vendor se nahi aaya, Admin team follow up kar rahi hai. Thursday tak confirm ho jayega.",
    start_ms: 45000,
    end_ms: 52000,
  },
  {
    speaker_id: "Speaker 3",
    speaker_label: "Hina - Sales",
    text: "Sales team ne Lahore ke do naye clients ke saath demo schedule kar liya hai Friday ko. Humein ek updated company profile PDF chahiye.",
    start_ms: 54000,
    end_ms: 63000,
  },
  {
    speaker_id: "Speaker 2",
    speaker_label: "Bilal - IT",
    text: "Hina, CRM portal par jo login issue aa raha tha woh fix ho gaya hai? Aur new company profile PDF kaun banayega?",
    start_ms: 64000,
    end_ms: 72000,
  },
  {
    speaker_id: "Speaker 3",
    speaker_label: "Hina - Sales",
    text: "Haan CRM login ab bilkul theek chal raha hai, thank you Bilal! Company profile PDF Marketing se Zainab banayengi ya nahi, yeh abhi confirm karna hai.",
    start_ms: 73000,
    end_ms: 83000,
  },
  {
    speaker_id: "Speaker 0",
    speaker_label: "Ali - Finance",
    text: "Decision yeh hai ke November se har department Friday ko apni weekly expense sheet Finance ko submit karega. Next meeting Monday subah 10 baje hogi.",
    start_ms: 85000,
    end_ms: 95000,
  },
];

export function buildDemoAnalysis(
  segments: TranscriptSegment[],
  outputLanguage: OutputLanguage
): MeetingAnalysisResult {
  const maxMs = segments.reduce((acc, s) => Math.max(acc, s.start_ms), 0);
  const fullText = segments.map((s) => s.text.toLowerCase()).join(" ");

  const notes: MeetingAnalysisResult["notes"] = [];
  const tasks: MeetingAnalysisResult["tasks"] = [];
  const questions: MeetingAnalysisResult["questions"] = [];
  const decisions: string[] = [];

  if (fullText.includes("invoice") || fullText.includes("logistics")) {
    notes.push({
      existing_id: null,
      department: "Finance",
      content:
        outputLanguage === "Urdu"
          ? "اکتوبر کے تین لاجسٹکس وینڈرز کی ادائیگیاں ابھی باقی ہیں۔"
          : "Three pending October logistics vendor invoices were reviewed and scheduled for clearance.",
      timestamp_ms: 10000,
    });
    tasks.push({
      existing_id: null,
      title:
        outputLanguage === "Roman Urdu"
          ? "Teeno pending logistics invoices clear karna"
          : "Clear the three pending logistics vendor invoices",
      assignee: "Ali - Finance",
      department: "Finance",
      deadline: "Today 5:00 PM",
      status: "Pending",
      timestamp_ms: 18000,
    });
  }

  if (fullText.includes("po copies")) {
    tasks.push({
      existing_id: null,
      title:
        outputLanguage === "Roman Urdu"
          ? "Approved PO copies Ali ko email karna"
          : "Email approved PO copies to Ali",
      assignee: "Sara - Operations",
      department: "Operations",
      deadline: "Immediately after meeting",
      status: "Pending",
      timestamp_ms: 27000,
    });
  }

  if (fullText.includes("wi-fi") || fullText.includes("router")) {
    notes.push({
      existing_id: null,
      department: "IT",
      content:
        outputLanguage === "Roman Urdu"
          ? "Office Wi-Fi router aur backup internet link upgrade ho gaya hai aur speed stable hai."
          : "Office Wi-Fi router and backup internet link were upgraded last night; speed is now stable.",
      timestamp_ms: 33000,
    });
  }

  if (fullText.includes("ups battery")) {
    notes.push({
      existing_id: null,
      department: "Admin",
      content: "Admin team is following up with the vendor for the server room UPS battery quote.",
      timestamp_ms: 45000,
    });
    questions.push({
      existing_id: null,
      question: "What is the status of the server room UPS battery backup?",
      asked_by: "Bilal - IT",
      is_open: false,
      answer: "Quote is pending from vendor; Admin is following up and will confirm by Thursday.",
      timestamp_ms: 33000,
      answered_timestamp_ms: 45000,
    });
  }

  if (fullText.includes("lahore") || fullText.includes("demo")) {
    notes.push({
      existing_id: null,
      department: "Sales",
      content: "Two client demos in Lahore are scheduled for Friday; an updated company profile PDF is needed.",
      timestamp_ms: 54000,
    });
  }

  if (fullText.includes("crm")) {
    questions.push({
      existing_id: null,
      question: "Is the CRM portal login issue resolved?",
      asked_by: "Bilal - IT",
      is_open: false,
      answer: "Yes, Hina confirmed the CRM login is working fine now.",
      timestamp_ms: 64000,
      answered_timestamp_ms: 73000,
    });
  }

  if (fullText.includes("company profile pdf")) {
    questions.push({
      existing_id: null,
      question: "Who will create the updated company profile PDF (Zainab from Marketing or someone else)?",
      asked_by: "Bilal - IT",
      is_open: true,
      answer: null,
      timestamp_ms: 64000,
      answered_timestamp_ms: null,
    });
  }

  if (fullText.includes("expense sheet")) {
    decisions.push(
      "Starting November, every department will submit its weekly expense sheet to Finance every Friday."
    );
    decisions.push("Next weekly sync will be held on Monday at 10:00 AM.");
  }

  const summary =
    maxMs < 35000
      ? "Weekly sync started with Finance and Operations reviewing three pending October logistics vendor invoices. Ali committed to clearing payments today by 5 PM once Sara sends the approved PO copies."
      : outputLanguage === "Urdu"
        ? "ہفتہ وار میٹنگ میں فنانس، آپریشنز، آئی ٹی اور سیلز کے معاملات کا جائزہ لیا گیا۔ علی آج شام 5 بجے تک تین لاجسٹکس انوائسز کلیئر کریں گے۔ آئی ٹی نے وائی فائی اور بیک اپ انٹرنیٹ اپ گریڈ کی تصدیق کی۔ لاہور کے دو کلائنٹس کے لیے جمعہ کو ڈیمو طے ہے جبکہ کمپنی پروفائل پی ڈی ایف کی ذمہ داری ابھی طے ہونا باقی ہے۔"
        : outputLanguage === "Roman Urdu"
          ? "Weekly sync mein Finance, Operations, IT aur Sales ke updates discuss hue. Ali aaj shaam 5 baje tak 3 pending logistics invoices clear karenge aur Sara approved PO copies bhejengi. IT ne office Wi-Fi aur backup internet upgrade confirm kiya aur CRM login issue resolve ho gaya. Sales ne Friday ko Lahore ke 2 clients ke saath demo schedule kiya hai, jabke updated company profile PDF kaun banayega yeh abhi open hai."
          : "The team held a weekly sync covering Finance, Operations, IT, and Sales. Ali will clear three pending October logistics invoices by 5 PM today after receiving approved PO copies from Sara. IT confirmed the office Wi-Fi and backup internet upgrade is complete and the CRM login issue is resolved. Sales scheduled two Lahore client demos for Friday, while ownership of the updated company profile PDF remains open.";

  return {
    summary,
    decisions,
    notes,
    tasks,
    questions,
  };
}

export function buildSeedDemoMeeting(): Meeting {
  const now = new Date().toISOString();
  const segments: TranscriptSegment[] = DEMO_TRANSCRIPT_LINES.map((line, idx) => ({
    id: `demo-seg-${idx + 1}`,
    meeting_id: "demo-meeting-seed",
    speaker_id: line.speaker_id,
    speaker_label: line.speaker_label,
    text: line.text,
    start_ms: line.start_ms,
    end_ms: line.end_ms,
    is_final: true,
  }));

  const analysis = buildDemoAnalysis(segments, "English");

  const notes: MeetingNote[] = analysis.notes.map((n, idx) => ({
    id: `demo-note-${idx + 1}`,
    meeting_id: "demo-meeting-seed",
    department: n.department,
    content: n.content,
    timestamp_ms: n.timestamp_ms,
  }));

  const tasks: MeetingTask[] = analysis.tasks.map((t, idx) => ({
    id: `demo-task-${idx + 1}`,
    meeting_id: "demo-meeting-seed",
    meeting_title: "Weekly Operations & Finance Sync (Sample)",
    meeting_date: now,
    title: t.title,
    assignee: t.assignee,
    department: t.department,
    deadline: t.deadline ?? null,
    status: t.status,
    timestamp_ms: t.timestamp_ms,
    created_at: now,
  }));

  const questions: MeetingQuestion[] = analysis.questions.map((q, idx) => ({
    id: `demo-q-${idx + 1}`,
    meeting_id: "demo-meeting-seed",
    question: q.question,
    answer: q.answer ?? null,
    is_open: q.is_open,
    asked_by: q.asked_by,
    timestamp_ms: q.timestamp_ms,
    answered_timestamp_ms: q.answered_timestamp_ms ?? null,
  }));

  return {
    id: "demo-meeting-seed",
    title: "Weekly Operations & Finance Sync (Sample)",
    started_at: now,
    ended_at: now,
    status: "completed",
    audio_path: null,
    speakers: DEMO_MEETING_SPEAKERS,
    summary: analysis.summary,
    decisions: analysis.decisions,
    output_language: "English",
    transcript_text: segments.map((s) => `${s.speaker_label}: ${s.text}`).join("\n"),
    segments,
    notes,
    tasks,
    questions,
  };
}

export function buildDemoAskAIResponse(
  query: string,
  meetings: Meeting[]
): AskAIResponse {
  const q = query.toLowerCase();
  const lines: string[] = [];
  const citations: AskAIResponse["citations"] = [];

  for (const m of meetings) {
    const matchedTasks = (m.tasks ?? []).filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        q.split(/\s+/).some((word) => word.length > 2 && (t.assignee.toLowerCase().includes(word) || t.department.toLowerCase().includes(word) || t.title.toLowerCase().includes(word)))
    );

    const matchedNotes = (m.notes ?? []).filter((n) =>
      q.split(/\s+/).some((word) => word.length > 2 && (n.content.toLowerCase().includes(word) || n.department.toLowerCase().includes(word)))
    );

    const isSummaryQuery = q.includes("summary") || q.includes("pichli") || q.includes("last");

    if (isSummaryQuery && m.summary) {
      lines.push(`**${m.title}** (${new Date(m.started_at).toLocaleDateString()}):\n${m.summary}`);
      citations.push({
        meeting_title: m.title,
        meeting_date: new Date(m.started_at).toLocaleDateString(),
        meeting_id: m.id,
      });
      break;
    }

    if (matchedTasks.length > 0 || matchedNotes.length > 0) {
      citations.push({
        meeting_title: m.title,
        meeting_date: new Date(m.started_at).toLocaleDateString(),
        meeting_id: m.id,
      });
      for (const t of matchedTasks) {
        lines.push(
          `• Task (${t.status}): **${t.title}** — Assigned to *${t.assignee}* [${t.department}]${t.deadline ? `, Deadline: ${t.deadline}` : ""} *(from ${m.title})*`
        );
      }
      for (const n of matchedNotes) {
        lines.push(`• Note [${n.department}]: ${n.content} *(from ${m.title})*`);
      }
    }
  }

  if (lines.length === 0) {
    return {
      answer:
        "Mujhe is baare mein saved meetings mein koi specific information nahi mili. (Demo fallback: configure GEMINI_API_KEY for full AI reasoning.)",
      citations: [],
    };
  }

  return {
    answer: lines.join("\n\n"),
    citations,
  };
}
