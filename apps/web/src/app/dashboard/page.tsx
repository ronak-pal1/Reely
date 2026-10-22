"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api, type ProjectSummary, type SessionUser, type TemplateCard } from "@/lib/api";

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load(q = query) {
    const [session, library, list] = await Promise.all([
      api<{ user: SessionUser }>("/users/me"),
      api<{ templates: TemplateCard[] }>("/templates"),
      api<{ projects: ProjectSummary[] }>(`/projects${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    ]);
    setUser(session.user);
    setTemplates(library.templates);
    setProjects(list.projects);
  }

  useEffect(() => {
    load("").catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load the studio");
    });
  }, []);

  async function createProject(input: { name?: string; templateId?: string }) {
    setCreating(true);
    setError(null);
    try {
      await api("/projects", { method: "POST", body: JSON.stringify(input) });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the project");
    } finally {
      setCreating(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-sm text-mute">{error ?? "Loading studio"}</main>;
  }

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
          REELIO
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="rounded-full border border-line bg-surface px-3 py-1">
            {user.credits} credits · {user.plan}
          </span>
          <Link href="/settings">{user.name}</Link>
        </div>
      </header>
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        {!user.emailVerified ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            Verify your email before creating projects. Open the link from your inbox, or the one shown after signup.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="mt-1 text-sm text-mute">Blank timelines and the built-in vertical templates.</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const q = new FormData(event.currentTarget).get("q");
              const next = typeof q === "string" ? q : "";
              setQuery(next);
              load(next).catch((caught) => setError(caught instanceof Error ? caught.message : "Search failed"));
            }}
          >
            <input
              name="q"
              defaultValue={query}
              placeholder="Search projects"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            />
          </form>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            disabled={creating || !user.emailVerified}
            onClick={() => createProject({ name: "Untitled" })}
            className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-left disabled:opacity-50"
          >
            <div className="text-lg font-medium">Blank project</div>
            <p className="mt-2 text-sm text-mute">9:16 timeline with video, text, audio, and caption tracks.</p>
          </button>
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={creating || !user.emailVerified}
              onClick={() => createProject({ templateId: template.id, name: template.name })}
              className="rounded-xl border border-line bg-surface-2 px-4 py-8 text-left disabled:opacity-50"
            >
              <div className="text-xs uppercase tracking-wide text-accent">{template.category}</div>
              <div className="mt-2 text-lg font-medium">{template.name}</div>
              <p className="mt-2 text-sm text-mute">{template.description}</p>
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {projects.map((project) => (
            <article key={project.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="aspect-[9/16] max-h-40 rounded-lg bg-black" />
              <h2 className="mt-3 font-medium">{project.name}</h2>
              <p className="text-xs text-mute">
                {project.aspect} · {new Date(project.updatedAt).toLocaleString()}
              </p>
              <div className="mt-3 flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={async () => {
                    const name = window.prompt("Project name", project.name);
                    if (!name) return;
                    await api(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
                    await load();
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await api(`/projects/${project.id}/duplicate`, { method: "POST" });
                    await load();
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${project.name}?`)) return;
                    await api(`/projects/${project.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
