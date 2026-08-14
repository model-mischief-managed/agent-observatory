import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Static sitemap so search-grounded agents (Perplexity, ChatGPT-search, Google
// AI) can index the pages that describe the experiment.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE.url}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE.url}/llms.txt`, changeFrequency: "daily", priority: 0.8 },
  ];
}
