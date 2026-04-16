import { getRuntimeConfig } from "@/lib/runtime-config";

const AGENT_API_BASE = (process.env.NEXT_PUBLIC_AGENT_HTTP_URL ?? "http://localhost:8000").replace(/\/$/, "");
const AGENT_AUTH_TOKEN = process.env.NEXT_PUBLIC_AGENT_AUTH_TOKEN ?? "";

function headers(modelBaseUrl: string, modelApiKey: string): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (AGENT_AUTH_TOKEN) h.Authorization = `Bearer ${AGENT_AUTH_TOKEN}`;
  if (modelBaseUrl) h["X-Model-Base-Url"] = modelBaseUrl;
  if (modelApiKey) h["X-Model-Api-Key"] = modelApiKey;
  return h;
}

export async function apiGet<T>(path: string): Promise<T> {
  const { modelBaseUrl, modelApiKey } = getRuntimeConfig();
  const res = await fetch(`${AGENT_API_BASE}${path}`, { headers: headers(modelBaseUrl, modelApiKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const { modelBaseUrl, modelApiKey } = getRuntimeConfig();
  const res = await fetch(`${AGENT_API_BASE}${path}`, {
    method: "POST",
    headers: { ...headers(modelBaseUrl, modelApiKey), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const { modelBaseUrl, modelApiKey } = getRuntimeConfig();
  const res = await fetch(`${AGENT_API_BASE}${path}`, {
    method: "DELETE",
    headers: headers(modelBaseUrl, modelApiKey),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
}
