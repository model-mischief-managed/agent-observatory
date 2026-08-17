import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Static sitemap so search-grounded agents (Perplexity, ChatGPT-search, Google
// AI) can index the pages that describe the experiment.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE.url}/ai-crawlers`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE.url}/detect`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE.url}/llms.txt`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE.url}/skill.md`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE.url}/feed.xml`, changeFrequency: "hourly", priority: 0.5 },
    { url: `${SITE.url}/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
