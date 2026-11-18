-- MeetNotes Supabase Schema + Row Level Security (RLS)
-- Safe to re-run (idempotent) in Supabase SQL Editor or via `supabase db push`

create extension if not exists pgcrypto;

-- 1. User Settings (departments, default output language)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  departments text[] not null default array[
    'Finance', 'HR', 'IT', 'Sales', 'Operations', 'Marketing', 'Admin', 'General'
  ],
  default_output_language text not null default 'English'
    check (default_output_language in ('English', 'Urdu', 'Roman Urdu')),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can view own settings" on public.user_settings;
create policy "Users can view own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

-- 2. Meetings
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Meeting',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'recording'
    check (status in ('recording', 'processing', 'completed')),
  audio_path text,
  speakers jsonb not null default '{}'::jsonb,
  summary text not null default '',
  decisions jsonb not null default '[]'::jsonb,
  output_language text not null default 'English'
    check (output_language in ('English', 'Urdu', 'Roman Urdu')),
  transcript_text text not null default '',
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(transcript_text, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_user_started_idx
  on public.meetings (user_id, started_at desc);

create index if not exists meetings_search_idx
  on public.meetings using gin (search_vector);

alter table public.meetings enable row level security;

drop policy if exists "Users can CRUD own meetings" on public.meetings;
create policy "Users can CRUD own meetings"
  on public.meetings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Transcript Segments
create table if not exists public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  speaker_id text not null default 'Speaker 1',
  speaker_label text not null default 'Speaker 1',
  text text not null,
  start_ms integer not null default 0,
  end_ms integer not null default 0,
  is_final boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists transcript_segments_meeting_idx
  on public.transcript_segments (meeting_id, start_ms asc);

alter table public.transcript_segments enable row level security;

drop policy if exists "Users can CRUD own transcript segments" on public.transcript_segments;
create policy "Users can CRUD own transcript segments"
  on public.transcript_segments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Department-wise Meeting Notes
create table if not exists public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department text not null default 'General',
  content text not null,
  timestamp_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_notes_meeting_idx
  on public.meeting_notes (meeting_id, timestamp_ms asc);

alter table public.meeting_notes enable row level security;

drop policy if exists "Users can CRUD own meeting notes" on public.meeting_notes;
create policy "Users can CRUD own meeting notes"
  on public.meeting_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Tasks / Assignments
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  assignee text not null default 'Unassigned',
  department text not null default 'General',
  deadline text,
  status text not null default 'Pending'
    check (status in ('Pending', 'Done')),
  timestamp_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_status_idx
  on public.tasks (user_id, status, created_at desc);

alter table public.tasks enable row level security;

drop policy if exists "Users can CRUD own tasks" on public.tasks;
create policy "Users can CRUD own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. Questions (open & answered)
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text,
  is_open boolean not null default true,
  asked_by text not null default 'Speaker 1',
  timestamp_ms integer not null default 0,
  answered_timestamp_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questions_meeting_idx
  on public.questions (meeting_id, is_open desc, timestamp_ms asc);

alter table public.questions enable row level security;

drop policy if exists "Users can CRUD own questions" on public.questions;
create policy "Users can CRUD own questions"
  on public.questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 7. Storage Bucket for Meeting Audio
insert into storage.buckets (id, name, public)
values ('meeting-audio', 'meeting-audio', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload own meeting audio" on storage.objects;
create policy "Users can upload own meeting audio"
  on storage.objects for insert
  with check (
    bucket_id = 'meeting-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can view own meeting audio" on storage.objects;
create policy "Users can view own meeting audio"
  on storage.objects for select
  using (
    bucket_id = 'meeting-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own meeting audio" on storage.objects;
create policy "Users can delete own meeting audio"
  on storage.objects for delete
  using (
    bucket_id = 'meeting-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
