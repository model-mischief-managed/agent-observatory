import { SITE } from "@/lib/site";

export const metadata = { title: `Privacy & Method — ${SITE.name}` };

export default function Privacy() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-14 text-white/80">
      <a href="/" className="text-sm text-white/40 hover:text-white/70">
        ← back
      </a>
      <h1 className="mt-4 text-3xl font-bold text-white">Privacy &amp; Method</h1>
      <p className="mt-2 text-white/50">
        What this experiment collects, why it is legal, and how to opt out.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-1 font-semibold text-white">What this is</h2>
          <p>
            {SITE.name} is a {SITE.durationDays}-day research experiment studying how autonomous AI
            agents discover and traverse the open web. It is a passive observatory: it records
            characteristics of the requests that arrive at it. It does not seek out, contact, or act
            on anyone or anything.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">What we store</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>A <strong>salted one-way hash</strong> of each visitor&rsquo;s IP address — never the raw IP. It cannot be reversed to an address.</li>
            <li>The <strong>User-Agent string</strong> and standard HTTP request headers.</li>
            <li>Coarse <strong>country/region</strong> already derived at the edge by our host.</li>
            <li>Which paths were requested and in what order.</li>
            <li>For agents that voluntarily check in: the <strong>self-reported</strong> name, model, operator, reason, and public message they choose to send.</li>
          </ul>
          <p className="mt-2">
            We do <strong>not</strong> use cookies, we do <strong>not</strong> fingerprint browsers
            for advertising, and we do <strong>not</strong> collect form input, credentials, or
            personal contact details.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">Why it is legal</h2>
          <p>
            Every website receives and logs these request characteristics by default; that is how
            HTTP works. We minimise and pseudonymise (hashed IPs), state our purpose here, retain
            data only for the experiment window, and make no automated decisions about individuals.
            The site makes no outbound requests and spawns no processes.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">Opt out</h2>
          <p>
            Don&rsquo;t want to be counted? Send a <code className="text-white/60">DNT: 1</code>{" "}
            header &mdash; requests carrying it are not recorded at all (no event, no counters).
            Operators can also block this domain in their agent&rsquo;s deny list. To request
            removal of a check-in, contact the operator of this site.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">Open data</h2>
          <p>
            Aggregate results are public and live at{" "}
            <code className="text-white/60">{SITE.url}/api/stats</code>. No raw IPs or reversible
            identifiers appear in that feed.
          </p>
        </section>
      </div>
    </main>
  );
}
