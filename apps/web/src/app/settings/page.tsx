"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api, type SessionUser } from "@/lib/api";

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: SessionUser }>("/users/me")
      .then((result) => setUser(result.user))
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  if (!user) return <main className="p-8 text-sm text-mute">Loading settings</main>;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-8">
      <Link href="/dashboard" className="text-sm text-mute">
        Back to projects
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-mute">
        {user.email} · {user.plan} · {user.credits} credits
      </p>
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          try {
            const result = await api<{ user: SessionUser }>("/users/me", {
              method: "PATCH",
              body: JSON.stringify({ name }),
            });
            setUser(result.user);
            setError(null);
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not save");
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            name="name"
            defaultValue={user.name}
            className="rounded-xl border border-line bg-surface px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button type="submit" className="rounded-xl bg-accent px-4 py-2 font-medium text-white">
          Save
        </button>
      </form>
      <button
        type="button"
        className="mt-6 text-left text-sm underline"
        onClick={async () => {
          await api("/auth/logout", { method: "POST" });
          window.location.href = "/login";
        }}
      >
        Sign out
      </button>
    </main>
  );
}
