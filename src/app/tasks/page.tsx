"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Edit3,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteTask,
  fetchAllTasks,
  fetchSettings,
  upsertTask,
} from "@/lib/storage/data-client";
import { DEFAULT_DEPARTMENTS, type MeetingTask } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function TasksBoardPage() {
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [departments, setDepartments] = useState<string[]>([
    ...DEFAULT_DEPARTMENTS,
  ]);
  const [loading, setLoading] = useState(true);

  const [filterPerson, setFilterPerson] = useState("ALL");
  const [filterDept, setFilterDept] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "Pending" | "Done">(
    "ALL"
  );

  // Add / Edit modal state
  const [editing, setEditing] = useState<MeetingTask | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formDept, setFormDept] = useState("General");
  const [formDeadline, setFormDeadline] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [t, s] = await Promise.all([fetchAllTasks(), fetchSettings()]);
    setTasks(t);
    setDepartments(s.departments);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.assignee) set.add(t.assignee);
    }
    return Array.from(set).sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterPerson !== "ALL" && t.assignee !== filterPerson) return false;
      if (filterDept !== "ALL" && t.department !== filterDept) return false;
      if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
      return true;
    });
  }, [tasks, filterPerson, filterDept, filterStatus]);

  const toggleStatus = async (task: MeetingTask) => {
    const next: MeetingTask = {
      ...task,
      status: task.status === "Done" ? "Pending" : "Done",
    };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? next : t)));
    await upsertTask(next);
  };

  const handleDelete = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await deleteTask(taskId);
  };

  const openAdd = () => {
    setEditing(null);
    setIsAdding(true);
    setFormTitle("");
    setFormAssignee("");
    setFormDept(departments[0] ?? "General");
    setFormDeadline("");
  };

  const openEdit = (task: MeetingTask) => {
    setIsAdding(false);
    setEditing(task);
    setFormTitle(task.title);
    setFormAssignee(task.assignee);
    setFormDept(task.department);
    setFormDeadline(task.deadline ?? "");
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const record: MeetingTask = editing
      ? {
          ...editing,
          title: formTitle.trim(),
          assignee: formAssignee.trim() || "Unassigned",
          department: formDept,
          deadline: formDeadline.trim() || null,
        }
      : {
          id: crypto.randomUUID(),
          meeting_id: null,
          title: formTitle.trim(),
          assignee: formAssignee.trim() || "Unassigned",
          department: formDept,
          deadline: formDeadline.trim() || null,
          status: "Pending",
          timestamp_ms: 0,
          created_at: new Date().toISOString(),
        };

    await upsertTask(record);
    setIsAdding(false);
    setEditing(null);
    await loadData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Tasks Board</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All action items across meetings.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={filterPerson}
          onChange={(e) => setFilterPerson(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="ALL">All People</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="ALL">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as "ALL" | "Pending" | "Done")
          }
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="ALL">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Done">Done</option>
        </select>
      </div>

      {/* Add/Edit Inline Form */}
      {(isAdding || editing) && (
        <form
          onSubmit={saveForm}
          className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-3 dark:border-blue-900 dark:bg-blue-950/30"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">
              {editing ? "Edit Task" : "New Manual Task"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditing(null);
              }}
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          <input
            type="text"
            required
            placeholder="Task description"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Assignee (e.g. Ali)"
              value={formAssignee}
              onChange={(e) => setFormAssignee(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <select
              value={formDept}
              onChange={(e) => setFormDept(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Deadline (optional)"
              value={formDeadline}
              onChange={(e) => setFormDeadline(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Save Task
            </button>
          </div>
        </form>
      )}

      {/* Tasks List */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Loading tasks...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          No tasks match the current filters.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((task) => (
            <div
              key={task.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => toggleStatus(task)}
                className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-600"
                aria-label="Toggle status"
              >
                {task.status === "Done" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    task.status === "Done" && "line-through text-slate-400"
                  )}
                >
                  {task.title}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {task.assignee}
                  </span>
                  <span>•</span>
                  <span>{task.department}</span>
                  {task.deadline && (
                    <>
                      <span>•</span>
                      <span className="text-amber-700 dark:text-amber-400">
                        Due: {task.deadline}
                      </span>
                    </>
                  )}
                  {task.meeting_id && task.meeting_title && (
                    <>
                      <span>•</span>
                      <Link
                        href={`/meetings/${task.meeting_id}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {task.meeting_title}
                      </Link>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(task)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label="Edit task"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  aria-label="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
