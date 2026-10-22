"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { migrateProject, type Project } from "@reelio/timeline-schema";
import { Editor } from "@/components/editor/Editor";
import type { MediaAsset } from "@/editor/media";
import { ApiError, api, type SessionUser, type TemplateCard } from "@/lib/api";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    const media = await api<{ assets: MediaAsset[] }>(`/assets?projectId=${params.id}`);
    setAssets(media.assets);
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ project: { timeline: unknown } }>(`/projects/${params.id}`),
      api<{ user: SessionUser }>("/users/me"),
      api<{ templates: TemplateCard[] }>("/templates"),
    ])
      .then(([projectResponse, session, library]) => {
        if (cancelled) return;
        setProject(migrateProject(projectResponse.project.timeline));
        setUser(session.user);
        setTemplates(library.templates);
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(caught instanceof Error ? caught.message : "Could not open the project");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    loadAssets().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load media"));
  }, [loadAssets]);

  useEffect(() => {
    if (!assets.some((asset) => asset.status === "uploading" || asset.status === "processing")) return;
    const timer = window.setInterval(() => {
      loadAssets().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [assets, loadAssets]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadAssets().catch(() => undefined);
    }, 8 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadAssets]);

  if (!project || !user) {
    return <main className="p-8 text-sm text-mute">{error ?? "Opening the project"}</main>;
  }

  return (
    <Editor
      projectId={params.id}
      initial={project}
      assets={assets}
      user={user}
      templates={templates}
      onAssets={loadAssets}
    />
  );
}
