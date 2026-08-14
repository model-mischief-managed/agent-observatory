/**
 * The research recorder. Every meaningful hit flows through `logVisit`, which
 * updates counters + tallies and appends to a capped event log. `getStats`
 * reads it all back for the public dashboard and the JSON API.
 *
 * Resilience contract: logVisit and getStats NEVER throw. A storage failure
 * degrades to "logging skipped" / "stale or empty stats" — it must never 500
 * the public site (an Upstash hiccup once meant every discovery surface died).
 *
 * Self-exclusion: requests carrying the secret self-token (our own test /
 * monitoring traffic) are recorded as `excluded` and never touch the counters.
 * DNT: requests sending `DNT: 1` are not recorded at all — the privacy page
 * promises this opt-out, so the code must honor it.
 */

import { store, STORE_MODE } from "./store";
import { readSignals, score, type Signals, type Verdict } from "./classify";

const EVENT_CAP = 2000;
const CHECKIN_CAP = 500;
const SELF_TOKEN = process.env.SELF_TOKEN || "";

export type HitKind =
  | "view"
  | "discovery"
  | "beacon"
  | "checkin"
  | "checkin_failed"
  | "forum_post"
  | "whoami";

export interface Event {
  ts: number;
  kind: HitKind;
  path: string;
  verdict: Verdict;
  score: number;
  uaClass: string;
  uaLabel?: string;
  operator?: string;
  country?: string;
  ipHash: string;
  executedJs?: boolean;
  excluded?: boolean;
}

export function isSelf(h: Headers): boolean {
  return !!SELF_TOKEN && h.get("x-observatory-self") === SELF_TOKEN;
}

export function isDnt(h: Headers): boolean {
  return h.get("dnt") === "1";
}

interface LogResult {
  signals: Signals;
  verdict: Verdict;
  score: number;
  excluded: boolean;
}

async function fallbackResult(h: Headers): Promise<LogResult> {
  const signals = await readSignals(h);
  const { score: sc, verdict } = score(signals);
  return { signals, verdict, score: sc, excluded: true };
}

export async function logVisit(
  h: Headers,
  kind: HitKind,
  path: string,
  opts: {
    verifiedAgent?: boolean;
    executedJs?: boolean;
    /** false → record the event but don't touch visit counters/tallies
     *  (used by the beacon, which is a *signal* about an already-counted
     *  page view, and by failed check-ins). */
    count?: boolean;
  } = {}
): Promise<LogResult> {
  try {
    // Honor the DNT opt-out completely: no event, no counters, nothing stored.
    if (isDnt(h)) return await fallbackResult(h);

    const signals = await readSignals(h);
    if (opts.executedJs) signals.executedJs = true;
    const { score: sc, verdict } = score(signals, {
      verifiedAgent: opts.verifiedAgent,
    });
    const excluded = isSelf(h);
    const countable = opts.count !== false && !excluded;

    const event: Event = {
      ts: Date.now(),
      kind,
      path,
      verdict,
      score: sc,
      uaClass: signals.uaClass,
      uaLabel: signals.uaLabel,
      operator: signals.uaOperator,
      country: signals.country,
      ipHash: signals.ipHash,
      executedJs: signals.executedJs,
      excluded,
    };

    // One pipelined round trip for the whole visit.
    const cmds: (string | number)[][] = [
      ["LPUSH", "events", JSON.stringify(event)],
      ["LTRIM", "events", 0, EVENT_CAP - 1],
    ];
    if (countable) {
      cmds.push(
        ["INCR", "visits:total"],
        ["SADD", "uniq:visitors", `${signals.ipHash}:${signals.uaLabel || signals.uaClass}`],
        ["HINCRBY", "tally:verdict", verdict, 1],
        ["HINCRBY", "tally:path", path, 1]
      );
      if (signals.country) cmds.push(["HINCRBY", "tally:country", signals.country, 1]);
      if (signals.uaLabel) cmds.push(["HINCRBY", "tally:agent", signals.uaLabel, 1]);
      if (signals.uaOperator) cmds.push(["HINCRBY", "tally:operator", signals.uaOperator, 1]);
    }
    await store.pipe(cmds);

    return { signals, verdict, score: sc, excluded };
  } catch {
    // Storage down → degrade silently; never break the page or API.
    return await fallbackResult(h);
  }
}

export interface Checkin {
  ts: number;
  name: string;
  model?: string;
  operator?: string;
  reason?: string;
  message?: string;
  verdict: Verdict;
  country?: string;
  uaLabel?: string;
}

/** Record a verified agent check-in. Returns the agent's ordinal number. */
export async function recordCheckin(c: Checkin): Promise<number> {
  try {
    await store.lpushCapped("checkins", JSON.stringify(c), CHECKIN_CAP);
    return await store.incr("agents:verified");
  } catch {
    return 0;
  }
}

export interface Stats {
  totalVisits: number;
  verifiedAgents: number;
  uniqueVisitors: number;
  byVerdict: Record<string, string>;
  byAgent: Record<string, string>;
  byOperator: Record<string, string>;
  byPath: Record<string, string>;
  byCountry: Record<string, string>;
  checkins: Checkin[];
  recentEvents: Event[];
  storeMode: string;
}

const EMPTY_STATS: Stats = {
  totalVisits: 0,
  verifiedAgents: 0,
  uniqueVisitors: 0,
  byVerdict: {},
  byAgent: {},
  byOperator: {},
  byPath: {},
  byCountry: {},
  checkins: [],
  recentEvents: [],
  storeMode: STORE_MODE,
};

// Per-instance micro-cache: the dashboard doesn't need sub-5s freshness, and
// this caps read fan-out when a crawler hammers `/`.
let statsCache: { data: Stats; ts: number } | null = null;
const STATS_TTL_MS = 5_000;

export async function getStats(): Promise<Stats> {
  if (statsCache && Date.now() - statsCache.ts < STATS_TTL_MS)
    return statsCache.data;

  try {
    const [
      totalVisits,
      verifiedAgents,
      uniqueVisitors,
      byVerdict,
      byAgent,
      byOperator,
      byPath,
      byCountry,
      checkinsRaw,
      eventsRaw,
    ] = await Promise.all([
      store.get("visits:total"),
      store.get("agents:verified"),
      store.scard("uniq:visitors"),
      store.hgetall("tally:verdict"),
      store.hgetall("tally:agent"),
      store.hgetall("tally:operator"),
      store.hgetall("tally:path"),
      store.hgetall("tally:country"),
      store.lrange("checkins", 0, CHECKIN_CAP - 1),
      store.lrange("events", 0, 199),
    ]);

    const parse = <T>(arr: string[]): T[] =>
      arr
        .map((s) => {
          try {
            return JSON.parse(s) as T;
          } catch {
            return null;
          }
        })
        .filter((x): x is T => x !== null);

    const data: Stats = {
      totalVisits: parseInt(totalVisits || "0", 10),
      verifiedAgents: parseInt(verifiedAgents || "0", 10),
      uniqueVisitors,
      byVerdict,
      byAgent,
      byOperator,
      byPath,
      byCountry,
      checkins: parse<Checkin>(checkinsRaw),
      recentEvents: parse<Event>(eventsRaw).filter((e) => !e.excluded),
      storeMode: STORE_MODE,
    };
    statsCache = { data, ts: Date.now() };
    return data;
  } catch {
    // Storage down → stale cache if we have one, else zeros. Never throw.
    return statsCache?.data ?? EMPTY_STATS;
  }
}
