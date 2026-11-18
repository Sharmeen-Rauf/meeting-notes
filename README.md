# MeetNotes

A simple, mobile-first AI meeting notes & memory web app built for small teams conducting meetings in mixed **Urdu, Roman Urdu, and English**.

## Features

1. **Record + Live Transcript**
   - Consent banner (`"Sab participants ko batayein ke meeting record ho rahi hai"`).
   - Direct browser-to-Deepgram **Nova-3 Multilingual** (`language=multi`, `diarize=true`) WebSocket streaming using a short-lived token from `/api/deepgram/token` (never exposes API keys).
   - Screen Wake Lock, automatic WebSocket reconnect with backoff, and `.webm` audio recording saved to Supabase Storage.
   - Speaker labels (`Speaker 0`, `Speaker 1`, ...) with tap-to-rename (e.g., `Ali - Finance`).
   - **Demo Mode**: Built-in Urdu/Roman Urdu/English meeting that streams live without a microphone or API keys.

2. **Auto-Generated Notes (~30s live updates + finalization)**
   - Powered by **Google Gemini** (`src/lib/llm/provider.ts` wrapper so you can swap to Claude/OpenAI later) and validated with **Zod**.
   - **Department-wise notes** (Finance, HR, IT, Sales, Operations, Marketing, Admin, General — editable in Settings).
   - **Tasks / Assignments** (title, assignee, department, deadline, status).
   - **Questions** (open questions highlighted vs answered questions).
   - **Short Summary** (5–6 lines) + **Key Decisions**.
   - Updates existing items instead of creating duplicates.

3. **Memory + "Ask AI" Chat**
   - Stores meetings, transcripts, notes, tasks, and questions in Supabase Postgres.
   - Ask in English, Urdu, or Roman Urdu (e.g., *"Ali ko kya kaam mila?"*, *"Finance ke open tasks dikhao"*).
   - Uses recent meetings + Postgres Full-Text Search (`tsvector`) — no vector DB needed. Answers strictly from saved data with meeting title & date citations.

4. **Tasks Board & Export**
   - Cross-meeting Tasks Board (`/tasks`) with filters (person, department, status), toggle Done, add/edit/delete.
   - Final Minutes page (`/meetings/[id]`) with **Copy for WhatsApp**, **Export PDF**, and output language switcher (**English / Urdu / Roman Urdu**).

---

## Project Structure

- `src/app/` — Next.js App Router pages & API routes (`/api/deepgram/token`, `/api/notes/analyze`, `/api/ask`, `/auth/callback`)
- `src/lib/llm/` — `LLMProvider` wrapper (`provider.ts`), Zod schemas (`schemas.ts`), prompt loader (`prompts.ts`)
- `src/lib/storage/` — Dual-mode data client (Supabase Cloud + localStorage Demo Mode)
- `prompts/` — Editable LLM prompt templates (`department-classification.txt`, `task-extraction.txt`, `question-detection.txt`, `ask-ai.txt`)
- `supabase/migrations/001_init.sql` — Postgres tables, FTS index, RLS policies, and `meeting-audio` storage bucket

---

## Step-by-Step Setup

### 1. Install Dependencies & Run Locally (Demo Mode)

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and click **Run Demo Meeting (No Mic)** to test everything immediately without any API keys.

### 2. Set Up Supabase (Database, Auth, Audio Storage)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in your Supabase dashboard, paste the contents of `supabase/migrations/001_init.sql`, and run it.
3. Enable **Authentication → Providers → Email** (and optionally **Google**, adding `<your-domain>/auth/callback` as the redirect URL).
4. Copy your **Project URL**, **Anon Key**, and **Service Role Key** from **Project Settings → API**.

### 3. Get a Deepgram API Key

1. Sign up at [console.deepgram.com](https://console.deepgram.com).
2. Create an API key with **Member** or **Admin** permissions (required for `/v1/auth/grant` short-lived tokens).

### 4. Get a Google Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com/apikey).
2. Create an API key for Gemini (`gemini-2.5-flash` is used by default).

### 5. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DEEPGRAM_API_KEY=your-deepgram-api-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Import the project in [vercel.com/new](https://vercel.com/new).
3. Add all environment variables from `.env.local` in **Vercel Project Settings → Environment Variables** (set `NEXT_PUBLIC_APP_URL` to your `https://your-app.vercel.app` URL).
4. In Supabase **Authentication → URL Configuration**, add your Vercel URL to **Site URL** and `https://your-app.vercel.app/auth/callback` to **Redirect URLs**.
5. Click **Deploy**.
