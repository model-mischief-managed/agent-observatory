/**
 * Known non-human User-Agent signatures.
 *
 * Two buckets:
 *  - `AI_AGENTS`: user-agents belonging to LLM-driven crawlers / assistants /
 *    browsing agents. A hit here is strong evidence of a *reasoning* agent.
 *  - `PLAIN_BOTS`: classic crawlers, monitors, libraries, and headless tooling.
 *    Non-human, but not the "AI agent" we're hunting for. We separate them so
 *    the counter isn't polluted by Googlebot and curl.
 *
 * Matching is case-insensitive substring. This list is intentionally editable —
 * part of the experiment is discovering agents we haven't catalogued yet.
 */

export type UAClass = "ai-agent" | "plain-bot" | "unknown";

export const AI_AGENTS: { pattern: string; label: string; operator: string }[] =
  [
    { pattern: "GPTBot", label: "GPTBot", operator: "OpenAI" },
    { pattern: "ChatGPT-User", label: "ChatGPT-User", operator: "OpenAI" },
    { pattern: "OAI-SearchBot", label: "OAI-SearchBot", operator: "OpenAI" },
    { pattern: "ClaudeBot", label: "ClaudeBot", operator: "Anthropic" },
    { pattern: "Claude-User", label: "Claude-User", operator: "Anthropic" },
    { pattern: "Claude-Web", label: "Claude-Web", operator: "Anthropic" },
    { pattern: "anthropic-ai", label: "anthropic-ai", operator: "Anthropic" },
    { pattern: "PerplexityBot", label: "PerplexityBot", operator: "Perplexity" },
    { pattern: "Perplexity-User", label: "Perplexity-User", operator: "Perplexity" },
    { pattern: "Google-Extended", label: "Google-Extended", operator: "Google" },
    { pattern: "Google-CloudVertexBot", label: "Vertex", operator: "Google" },
    { pattern: "GoogleAgent-Mariner", label: "Project Mariner", operator: "Google" },
    { pattern: "Gemini", label: "Gemini", operator: "Google" },
    { pattern: "meta-externalagent", label: "Meta External Agent", operator: "Meta" },
    { pattern: "FacebookBot", label: "FacebookBot", operator: "Meta" },
    { pattern: "Bytespider", label: "Bytespider", operator: "ByteDance" },
    { pattern: "Amazonbot", label: "Amazonbot", operator: "Amazon" },
    { pattern: "cohere-ai", label: "cohere-ai", operator: "Cohere" },
    { pattern: "CCBot", label: "CCBot", operator: "Common Crawl" },
    { pattern: "Diffbot", label: "Diffbot", operator: "Diffbot" },
    { pattern: "YouBot", label: "YouBot", operator: "You.com" },
    { pattern: "DuckAssistBot", label: "DuckAssistBot", operator: "DuckDuckGo" },
    { pattern: "Applebot-Extended", label: "Applebot-Extended", operator: "Apple" },
    { pattern: "MistralAI", label: "MistralAI-User", operator: "Mistral" },
    { pattern: "Operator", label: "Operator", operator: "OpenAI" },
    { pattern: "Devin", label: "Devin", operator: "Cognition" },
    // Agent frameworks / browser-automation stacks used by autonomous agents
    { pattern: "browser-use", label: "browser-use", operator: "framework" },
    { pattern: "LangChain", label: "LangChain", operator: "framework" },
    { pattern: "LlamaIndex", label: "LlamaIndex", operator: "framework" },
    { pattern: "AutoGPT", label: "AutoGPT", operator: "framework" },
  ];

export const PLAIN_BOTS: string[] = [
  "Googlebot",
  "bingbot",
  "Slurp",
  "DuckDuckBot",
  "Baiduspider",
  "YandexBot",
  "Sogou",
  "Exabot",
  "facebookexternalhit",
  "LinkedInBot",
  "Twitterbot",
  "Discordbot",
  "TelegramBot",
  "WhatsApp",
  "Slackbot",
  "curl/",
  "Wget",
  "python-requests",
  "python-httpx",
  "aiohttp",
  "Go-http-client",
  "node-fetch",
  "axios",
  "Java/",
  "okhttp",
  "libwww-perl",
  "PostmanRuntime",
  "insomnia",
  "HeadlessChrome",
  "PhantomJS",
  "Playwright",
  "Puppeteer",
  "UptimeRobot",
  "Pingdom",
  "StatusCake",
  "SemrushBot",
  "AhrefsBot",
  "DotBot",
  "MJ12bot",
  "PetalBot",
  "DataForSeoBot",
];

export function classifyUA(ua: string): {
  cls: UAClass;
  label?: string;
  operator?: string;
} {
  if (!ua) return { cls: "unknown" };
  const lc = ua.toLowerCase();
  for (const a of AI_AGENTS) {
    if (lc.includes(a.pattern.toLowerCase()))
      return { cls: "ai-agent", label: a.label, operator: a.operator };
  }
  for (const b of PLAIN_BOTS) {
    if (lc.includes(b.toLowerCase())) return { cls: "plain-bot", label: b };
  }
  return { cls: "unknown" };
}
