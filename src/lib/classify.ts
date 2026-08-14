/**
 * Turn an incoming request's headers into a privacy-safe signal profile and a
 * confidence score for "is this a non-human AI agent?".
 *
 * Nothing here is a hard yes/no. Classification is a weighted read of passive
 * signals; the decisive proof-of-agency comes from the reasoning challenge
 * (see challenge.ts). We never store raw IPs — only a salted hash and the
 * coarse geo that Vercel already derived at the edge.
 */

import { classifyUA, type UAClass } from "./known-agents";

const SALT = process.env.HASH_SALT || "observatory-dev-salt";

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type Verdict = "ai-agent" | "plain-bot" | "human-like" | "unknown";

export interface Signals {
  ua: string;
  uaClass: UAClass;
  uaLabel?: string;
  uaOperator?: string;
  ipHash: string; // salted, non-reversible
  country?: string;
  region?: string;
  // Browser-only headers a plain HTTP client won't send
  hasAcceptLanguage: boolean;
  hasClientHints: boolean; // sec-ch-ua
  hasFetchMetadata: boolean; // sec-fetch-*
  acceptsHtml: boolean;
  referer?: string;
  // Filled in later by the JS beacon if the visitor executed JavaScript
  executedJs?: boolean;
}

export function firstIp(xff: string | null): string {
  if (!xff) return "";
  return xff.split(",")[0].trim();
}

/** Salted, non-reversible source key for rate limiting — never the raw IP. */
export async function sourceHash(h: Headers): Promise<string> {
  const ip = firstIp(h.get("x-forwarded-for")) || h.get("x-real-ip") || "unknown";
  return (await sha256(SALT + ip)).slice(0, 16);
}

export async function readSignals(h: Headers): Promise<Signals> {
  const ua = h.get("user-agent") || "";
  const { cls, label, operator } = classifyUA(ua);
  const ip =
    firstIp(h.get("x-forwarded-for")) || h.get("x-real-ip") || "unknown";

  return {
    ua,
    uaClass: cls,
    uaLabel: label,
    uaOperator: operator,
    ipHash: (await sha256(SALT + ip)).slice(0, 16),
    country: h.get("x-vercel-ip-country") || undefined,
    region: h.get("x-vercel-ip-country-region") || undefined,
    hasAcceptLanguage: !!h.get("accept-language"),
    hasClientHints: !!h.get("sec-ch-ua"),
    hasFetchMetadata: !!h.get("sec-fetch-mode") || !!h.get("sec-fetch-dest"),
    acceptsHtml: (h.get("accept") || "").includes("text/html"),
    referer: h.get("referer") || undefined,
  };
}

/**
 * Score 0–100 for "non-human agent likelihood", plus a verdict label.
 * `verifiedAgent` short-circuits to a high score: it means the visitor passed
 * the reasoning challenge, which is the strongest possible signal.
 */
export function score(
  s: Signals,
  opts: { verifiedAgent?: boolean } = {}
): { score: number; verdict: Verdict } {
  if (opts.verifiedAgent) return { score: 99, verdict: "ai-agent" };

  if (s.uaClass === "ai-agent") return { score: 90, verdict: "ai-agent" };
  if (s.uaClass === "plain-bot") return { score: 60, verdict: "plain-bot" };

  // Unknown UA — infer from header shape.
  const browserSignals =
    (s.hasAcceptLanguage ? 1 : 0) +
    (s.hasClientHints ? 1 : 0) +
    (s.hasFetchMetadata ? 1 : 0);

  // Rich browser fingerprint + actually ran JS => most likely a human.
  if (browserSignals >= 2 && s.executedJs)
    return { score: 15, verdict: "human-like" };
  if (browserSignals >= 2) return { score: 30, verdict: "human-like" };

  // Sparse headers, no client hints, no JS => a non-browser HTTP client,
  // i.e. a script or a headless agent. Suspicious, but unproven.
  if (browserSignals === 0) return { score: 65, verdict: "unknown" };

  return { score: 45, verdict: "unknown" };
}
