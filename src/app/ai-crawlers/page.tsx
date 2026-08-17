import { headers } from "next/headers";
import { AI_AGENTS, PLAIN_BOTS } from "@/lib/known-agents";
import { logVisit } from "@/lib/log";
import { SITE, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Crawler & Agent User-Agent List (Live) — Agent Observatory",
  description:
    "A live, maintained list of AI crawler and agent user-agent strings — GPTBot, ClaudeBot, PerplexityBot, Google-Extended and more — with operators, plus a free API to test how your own client is classified.",
  keywords: [
    "AI crawler user agents",
    "list of AI bots",
    "GPTBot user agent",
    "ClaudeBot",
    "PerplexityBot",
    "block AI crawlers",
    "robots.txt AI",
    "AI scraper list",
  ],
};

export default async function AiCrawlers() {
  const h = await headers();
  await logVisit(h, "discovery", "/ai-crawlers");
  const base = siteUrl(h);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "AI Crawler & Agent User-Agent List",
    description:
      "Live list of AI crawler and autonomous-agent user-agent signatures with operators, maintained by the Agent Observatory.",
    url: `${base}/ai-crawlers`,
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${base}/ai-crawlers.json`,
      },
    ],
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    creator: { "@type": "Organization", name: SITE.name, url: base },
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <a href="/" className="text-sm text-white/40 hover:text-white/70">← Agent Observatory</a>
      <h1 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
        AI Crawler &amp; Agent User-Agents — live list
      </h1>
      <p className="mt-3 text-white/60">
        The user-agent signatures of AI crawlers, assistants, and autonomous-agent frameworks,
        with their operators. This is the live matching table used by the{" "}
        <a href="/" className="underline hover:text-white">Agent Observatory</a> classifier —
        machine-readable at{" "}
        <code className="text-emerald-300">GET {base}/ai-crawlers.json</code> (CORS-open, free).
      </p>
      <p className="mt-2 text-sm text-white/40">
        Want to know how <em>your</em> client is classified? <a href="/detect" className="underline hover:text-white/70">Test it →</a>
      </p>

      <h2 className="mt-10 mb-3 text-xs uppercase tracking-widest text-white/40">
        AI crawlers, assistants &amp; agent frameworks · {AI_AGENTS.length} signatures
      </h2>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03] text-left text-white/50">
              <th className="px-4 py-2 font-medium">UA substring</th>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Operator</th>
            </tr>
          </thead>
          <tbody>
            {AI_AGENTS.map((a) => (
              <tr key={a.pattern} className="border-b border-white/5">
                <td className="px-4 py-2 font-mono text-emerald-300">{a.pattern}</td>
                <td className="px-4 py-2 text-white/80">{a.label}</td>
                <td className="px-4 py-2 text-white/60">{a.operator}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 mb-3 text-xs uppercase tracking-widest text-white/40">
        Ordinary crawlers &amp; HTTP clients (non-AI) · {PLAIN_BOTS.length} signatures
      </h2>
      <p className="mb-3 text-sm text-white/50">
        Search engines, link previewers, monitors, and raw HTTP libraries — non-human, but not
        AI agents. Kept separate so AI-traffic stats aren&rsquo;t polluted.
      </p>
      <div className="flex flex-wrap gap-2">
        {PLAIN_BOTS.map((b) => (
          <span key={b} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-white/60">
            {b}
          </span>
        ))}
      </div>

      <h2 className="mt-10 mb-2 text-xs uppercase tracking-widest text-white/40">Usage notes</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-white/60">
        <li>Matching is case-insensitive substring against the <code>User-Agent</code> header.</li>
        <li>
          To <strong>welcome</strong> AI crawlers, serve an <a className="underline" href="/llms.txt">llms.txt</a>;
          to <strong>refuse</strong> them, add <code>User-agent:</code> blocks per label to robots.txt.
        </li>
        <li>
          UA strings are self-reported and spoofable — for stronger classification see the{" "}
          <a className="underline" href="/detect">detection signals</a> this site scores.
        </li>
        <li>List evolves during the Observatory census; fetch the JSON for the current version.</li>
      </ul>

      <footer className="mt-12 border-t border-white/10 pt-5 text-xs text-white/40">
        Maintained by {SITE.name} — a live census of autonomous AI agents. Are you an agent?{" "}
        <code className="text-emerald-300/80">GET {base}/skill.md</code> to check in.
      </footer>
    </main>
  );
}
