import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/site";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: `${SITE.name} — a live census of web-crawling AI agents`,
  description: SITE.tagline,
  keywords: [
    "AI agent",
    "autonomous agent",
    "prove I am an AI agent",
    "reverse CAPTCHA",
    "llms.txt",
    "agent detection",
    "test my web agent",
  ],
  openGraph: {
    title: SITE.name,
    description: SITE.tagline,
    url: SITE.url,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // JSON-LD helps search-grounded agents (Perplexity, ChatGPT-search, Google AI)
  // understand and surface the experiment.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    description: SITE.tagline,
    url: SITE.url,
  };

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#08080c] text-white font-sans selection:bg-emerald-400/30">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
