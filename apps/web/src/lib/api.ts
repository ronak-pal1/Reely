export type SessionUser = {
  id: string;
  email: string;
  name: string;
  plan: "free" | "pro" | "studio";
  credits: number;
  emailVerified: boolean;
  avatarUrl: string | null;
  limits: {
    name: string;
    watermark: boolean;
    maxHeight: number;
    monthlyCredits: number;
    maxDurationSeconds: number;
    priority: boolean;
  };
};

export type ProjectSummary = {
  id: string;
  name: string;
  aspect: "9:16" | "1:1" | "16:9";
  createdAt: string;
  updatedAt: string;
  templateId: string | null;
};

export type TemplateCard = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  aspect: "9:16" | "1:1" | "16:9";
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
}

let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${baseUrl()}/auth/csrf`, { credentials: "include" });
  const body = (await response.json()) as { token: string };
  csrfToken = body.token;
  return csrfToken;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (method !== "GET" && method !== "HEAD") headers.set("x-csrf-token", await ensureCsrf());
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers, credentials: "include" });
  if (
    response.status === 401 &&
    retry &&
    path !== "/auth/refresh" &&
    path !== "/auth/login" &&
    path !== "/auth/signup"
  ) {
    const refresh = await fetch(`${baseUrl()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "x-csrf-token": await ensureCsrf() },
    });
    if (refresh.ok) return api<T>(path, init, false);
  }
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    throw new ApiError(response.status, data.error?.message ?? "Request failed");
  }
  return data as T;
}
