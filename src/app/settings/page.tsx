"use client";

import { useEffect, useState } from "react";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import { fetchSettings, saveSettings } from "@/lib/storage/data-client";
import { DEFAULT_DEPARTMENTS, type OutputLanguage } from "@/lib/types";

export default function SettingsPage() {
  const [departments, setDepartments] = useState<string[]>([
    ...DEFAULT_DEPARTMENTS,
  ]);
  const [newDept, setNewDept] = useState("");
  const [outputLanguage, setOutputLanguage] =
    useState<OutputLanguage>("English");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings().then((s) => {
      setDepartments(s.departments);
      setOutputLanguage(s.default_output_language);
    });
  }, []);

  const persist = async (nextDepts: string[], nextLang: OutputLanguage) => {
    await saveSettings({
      departments: nextDepts,
      default_output_language: nextLang,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const addDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDept.trim();
    if (!name || departments.includes(name)) return;
    const next = [...departments, name];
    setDepartments(next);
    setNewDept("");
    await persist(next, outputLanguage);
  };

  const removeDepartment = async (dept: string) => {
    if (departments.length <= 1) return;
    const next = departments.filter((d) => d !== dept);
    setDepartments(next);
    await persist(next, outputLanguage);
  };

  const resetDefaults = async () => {
    const next = [...DEFAULT_DEPARTMENTS];
    setDepartments(next);
    await persist(next, outputLanguage);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Customize departments and default minutes language.
          </p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>

      {/* Default Output Language */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 dark:border-slate-800 dark:bg-slate-900">
        <label className="block text-sm font-semibold">
          Default Output Language
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Used for auto-generated notes, summaries, and tasks.
        </p>
        <select
          value={outputLanguage}
          onChange={(e) => {
            const lang = e.target.value as OutputLanguage;
            setOutputLanguage(lang);
            persist(departments, lang);
          }}
          className="mt-1 w-full sm:w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="English">English</option>
          <option value="Roman Urdu">Roman Urdu</option>
          <option value="Urdu">Urdu</option>
        </select>
      </section>

      {/* Editable Departments */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Departments</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Notes and tasks are grouped into these departments.
            </p>
          </div>
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {departments.map((dept) => (
            <span
              key={dept}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200"
            >
              {dept}
              {departments.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDepartment(dept)}
                  aria-label={`Remove ${dept}`}
                  className="text-slate-400 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>

        <form onSubmit={addDepartment} className="flex gap-2 pt-2">
          <input
            type="text"
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            placeholder="Add department (e.g. Logistics)"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
