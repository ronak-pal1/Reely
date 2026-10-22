"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ApiError, api } from "@/lib/api";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const token = params.get("token") ?? "";

  return (
    <form
      className="mt-8 flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api("/auth/reset", {
            method: "POST",
            body: JSON.stringify({ token, password: form.get("password") }),
          });
          router.push("/login");
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : "Could not reset the password");
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="rounded-xl border border-line bg-surface px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button type="submit" className="rounded-xl bg-accent px-4 py-2 font-medium text-white">
        Update password
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/login" className="text-sm text-mute">
        Back to sign in
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
