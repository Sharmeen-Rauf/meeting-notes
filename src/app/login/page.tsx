"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  const handleEmailAuth = async (mode: "signin" | "signup") => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    const res =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }

    if (mode === "signup") {
      setMessage("Check your email to confirm your account.");
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
    router.refresh();
  };

  if (!supabase) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <ShieldCheck className="h-5 w-5" />
          <h1 className="text-lg font-bold">Demo Mode Active</h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Supabase environment variables are not configured yet, so MeetNotes is
          running in local Demo Mode. Meetings and tasks are saved in your
          browser.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          To enable cloud sync, audio storage, and login, add{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Continue in Demo Mode
        </button>
      </div>
    );
  }

  if (userEmail) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-bold">Account</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Signed in as <strong>{userEmail}</strong>
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h1 className="text-xl font-bold">Sign in to MeetNotes</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sync meetings, audio, and tasks securely to your account.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          {message}
        </div>
      )}

      <div className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleEmailAuth("signin")}
            className="rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Sign In
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleEmailAuth("signup")}
            className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Sign Up
          </button>
        </div>
      </div>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200 dark:border-slate-800" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400 dark:bg-slate-900">
            Or
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        <Mail className="h-4 w-4" />
        Continue with Google
      </button>
    </div>
  );
}
