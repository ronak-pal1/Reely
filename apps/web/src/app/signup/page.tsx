"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
        REELIO
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Create your account</h1>
      <p className="mt-2 text-sm text-mute">Free includes a watermark, 720p export, and 30 credits.</p>
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          const form = new FormData(event.currentTarget);
          try {
            const result = await api<{ verificationUrl?: string }>("/auth/signup", {
              method: "POST",
              body: JSON.stringify({
                name: form.get("name"),
                email: form.get("email"),
                password: form.get("password"),
              }),
            });
            if (result.verificationUrl) {
              router.push(result.verificationUrl.replace(/^https?:\/\/[^/]+/, ""));
              return;
            }
            router.push("/dashboard");
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not create the account");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" required className="rounded-xl border border-line bg-surface px-3 py-2" />
        </label>
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
          {pending ? "Creating" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-mute">
        Already editing?{" "}
        <Link href="/login" className="text-ink underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
