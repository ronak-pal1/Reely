"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";

export default function ForgotPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [resetPath, setResetPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/login" className="text-sm text-mute">
        Back to sign in
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Reset password</h1>
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const form = new FormData(event.currentTarget);
          try {
            const result = await api<{ resetUrl?: string }>("/auth/forgot", {
              method: "POST",
              body: JSON.stringify({ email: form.get("email") }),
            });
            setMessage("If that email has a password, a reset link is on its way.");
            if (result.resetUrl) setResetPath(result.resetUrl.replace(/^https?:\/\/[^/]+/, ""));
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not send the reset link");
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rounded-xl border border-line bg-surface px-3 py-2" />
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-mute">{message}</p> : null}
        {resetPath ? (
          <Link href={resetPath} className="text-sm text-accent underline">
            Open the reset link
          </Link>
        ) : null}
        <button type="submit" className="rounded-xl bg-accent px-4 py-2 font-medium text-white">
          Send reset link
        </button>
      </form>
    </main>
  );
}
