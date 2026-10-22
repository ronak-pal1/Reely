"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ApiError, api } from "@/lib/api";

function VerifyForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const token = params.get("token") ?? "";

  return (
    <div className="mt-8">
      {done ? <p className="text-sm">Email verified. You can open the dashboard.</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="button"
        className="mt-4 rounded-xl bg-accent px-4 py-2 font-medium text-white"
        onClick={async () => {
          try {
            await api("/auth/verify", { method: "POST", body: JSON.stringify({ token }) });
            setDone(true);
            router.push("/dashboard");
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not verify");
          }
        }}
      >
        Verify email
      </button>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="text-sm font-semibold tracking-[0.22em]">
        REELIO
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Confirm your email</h1>
      <Suspense>
        <VerifyForm />
      </Suspense>
    </main>
  );
}
