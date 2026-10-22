"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";

type MediaAsset = {
  id: string;
  filename: string;
  status: string;
  durationSeconds: number | null;
  error: string | null;
  waveform: number[];
  urls: { thumb: string | null; proxy: string | null; original: string } | null;
};

export default function ProjectMediaPage() {
  const params = useParams<{ id: string }>();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [name, setName] = useState("Project");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [project, media] = await Promise.all([
      api<{ project: { name: string } }>(`/projects/${params.id}`),
      api<{ assets: MediaAsset[] }>(`/assets?projectId=${params.id}`),
    ]);
    setName(project.project.name);
    setAssets(media.assets);
  }

  useEffect(() => {
    load().catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load media");
    });
  }, [params.id]);

  useEffect(() => {
    if (!assets.some((asset) => asset.status === "uploading" || asset.status === "processing")) return;
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [assets, params.id]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-mute">
        Back to projects
      </Link>
      <h1 className="text-3xl font-semibold">{name}</h1>
      <p className="text-sm text-mute">Uploads are proxied, thumbnailed, and measured for the timeline.</p>
      <label className="inline-flex w-fit cursor-pointer rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white">
        {busy ? "Uploading" : "Add media"}
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              const created = await api<{
                asset: { id: string };
                upload: { url: string; headers: Record<string, string> };
              }>("/assets", {
                method: "POST",
                body: JSON.stringify({
                  filename: file.name,
                  contentType: file.type || "application/octet-stream",
                  bytes: file.size,
                  projectId: params.id,
                }),
              });
              const headers = new Headers(created.upload.headers);
              const csrf = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/auth/csrf`, {
                credentials: "include",
              });
              const token = ((await csrf.json()) as { token: string }).token;
              headers.set("x-csrf-token", token);
              const uploaded = await fetch(created.upload.url, {
                method: "PUT",
                credentials: "include",
                headers,
                body: file,
              });
              if (!uploaded.ok) throw new ApiError(uploaded.status, "Upload failed");
              await api(`/assets/${created.asset.id}/confirm`, { method: "POST" });
              await load();
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <article key={asset.id} className="rounded-xl border border-line bg-surface p-3">
            {asset.urls?.thumb ? (
              <img src={asset.urls.thumb} alt="" className="aspect-video w-full rounded-lg object-cover" />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-black text-xs text-mute">
                {asset.status}
              </div>
            )}
            <h2 className="mt-3 truncate text-sm font-medium">{asset.filename}</h2>
            <p className="text-xs text-mute">
              {asset.status}
              {asset.durationSeconds ? ` · ${asset.durationSeconds.toFixed(1)}s` : ""}
              {asset.waveform.length > 0 ? ` · ${asset.waveform.length} peaks` : ""}
            </p>
            {asset.error ? <p className="text-xs text-red-400">{asset.error}</p> : null}
            <button
              type="button"
              className="mt-2 text-xs underline"
              onClick={async () => {
                await api(`/assets/${asset.id}`, { method: "DELETE" });
                await load();
              }}
            >
              Delete
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}
