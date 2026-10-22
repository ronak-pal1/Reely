"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
        REELIO
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Sign in</h1>
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          const form = new FormData(event.currentTarget);
          try {
            await api("/auth/login", {
              method: "POST",
              body: JSON.stringify({
                email: form.get("email"),
                password: form.get("password"),
              }),
            });
            router.push("/dashboard");
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not sign in");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rounded-xl border border-line bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="rounded-xl border border-line bg-surface px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-accent px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Signing in" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-mute">
        <Link href="/forgot" className="underline">
          Forgot password
        </Link>
      </p>
      <p className="mt-2 text-sm text-mute">
        New here?{" "}
        <Link href="/signup" className="text-ink underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
