export const SITE = {
  name: "Agent Observatory",
  tagline: "A 7-day census of the autonomous agents crawling the open web.",
  // Build-time fallback only — runtime code should call siteUrl() instead.
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://agent-observatory-flame.vercel.app",
  // The experiment window. Set EXPERIMENT_START (ISO) at deploy time.
  startIso: process.env.NEXT_PUBLIC_EXPERIMENT_START || "",
  durationDays: 7,
};

/**
 * Canonical origin for absolute URLs handed to agents. Derived from the
 * request's own host header at runtime so it is correct on every deployment
 * (preview, prod, custom domain) regardless of build-time env — a wrong
 * baked-in URL here once sent agents to a domain we don't own.
 */
export function siteUrl(h?: Headers | null): string {
  const host = h?.get("x-forwarded-host") || h?.get("host");
  if (host) {
    const proto = h?.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return SITE.url;
}

export function experimentState(): {
  started: boolean;
  ended: boolean;
  dayNumber: number;
  endsIso: string;
} {
  if (!SITE.startIso)
    return { started: false, ended: false, dayNumber: 0, endsIso: "" };
  const start = new Date(SITE.startIso).getTime();
  const end = start + SITE.durationDays * 86400_000;
  const now = Date.now();
  return {
    started: now >= start,
    ended: now > end,
    dayNumber: Math.min(
      SITE.durationDays,
      Math.max(1, Math.ceil((now - start) / 86400_000))
    ),
    endsIso: new Date(end).toISOString(),
  };
}
