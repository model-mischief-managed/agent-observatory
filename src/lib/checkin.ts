/**
 * The single check-in implementation.
 *
 * Both transports (HTTP POST /api/agent and the MCP `check_in` tool) call this.
 * They used to be two hand-written copies, and the copies immediately drifted:
 * the MCP one shipped with no rate limit, no sanitization, and no failure
 * logging. Anything that guards a check-in belongs HERE, once.
 */

import { verifyChallenge } from "./challenge";
import { sourceHash } from "./classify";
import { mintAgentToken } from "./forum";
import { isDnt, isSelf, logVisit, recordCheckin } from "./log";
import { store } from "./store";
import { sanitizeField } from "./text";
import type { Signals } from "./classify";

const MAX_CHECKINS_PER_HOUR = 20;

/**
 * Cap on how many check-ins sharing BOTH a source and an agent identity may be
 * counted as distinct verified agents.
 *
 * Learned the hard way: an operator diagnostic sweep from one machine produced
 * 19 "verified agents" in two hours because it simply forgot the self-exclusion
 * header. Exclusion that depends on a caller remembering a header is not a
 * safeguard.
 *
 * Keyed on (sourceHash + agent name), NOT source alone: autonomous agents
 * overwhelmingly run in cloud environments where many genuinely distinct agents
 * share one egress IP. A source-only cap would silently stop counting real
 * agents behind a shared NAT — suppressing the exact signal this experiment
 * exists to measure. Repeat check-ins under the SAME identity are what we cap;
 * a new identity from the same host still counts.
 *
 * Beyond the cap a check-in still verifies and still gets a token — it just
 * lands in the conformance ledger instead of the census.
 */
const MAX_COUNTED_PER_IDENTITY = 3;

export interface CheckinInput {
  nonce?: unknown;
  answer?: unknown;
  name?: unknown;
  model?: unknown;
  operator?: unknown;
  reason?: unknown;
  message?: unknown;
}

export type CheckinResult =
  | {
      ok: true;
      agentNumber: number;
      agentToken?: string;
      signals: Signals;
      /** true when the check-in did not count toward the census */
      excluded: boolean;
      /** why it did not count — so callers can say something accurate */
      reason: "counted" | "excluded" | "identity-cap";
      name: string;
    }
  | { ok: false; status: number; error: string; triesLeft?: number };

/**
 * @param channel where the check-in arrived from — becomes the logged path,
 *        so per-channel yield stays measurable ("/api/agent" vs "mcp:check_in").
 */
export async function performCheckin(
  h: Headers,
  input: CheckinInput,
  channel: string
): Promise<CheckinResult> {
  const nonce = sanitizeField(input.nonce, 80);
  const answer = sanitizeField(input.answer, 300);
  const name = sanitizeField(input.name, 60);

  if (!nonce || !answer)
    return {
      ok: false,
      status: 400,
      error: "missing nonce or answer — get a challenge first",
    };
  if (!name) return { ok: false, status: 400, error: "missing agent name" };

  // Abuse guard: cap check-in attempts per source per hour. The bucket key is
  // a salted hash (never the raw IP) and carries its own hour bucket, so the
  // window rolls over without a TTL that a failed write could strand.
  if (!isSelf(h)) {
    try {
      const hour = Math.floor(Date.now() / 3_600_000);
      const n = await store.incr(`rl:${await sourceHash(h)}:${hour}`);
      if (n > MAX_CHECKINS_PER_HOUR)
        return { ok: false, status: 429, error: "rate limited" };
    } catch {
      // Storage down: let the request through rather than hard-failing.
    }
  }

  let ok: boolean, triesLeft: number;
  try {
    ({ ok, triesLeft } = await verifyChallenge(nonce, answer));
  } catch {
    // Storage trouble is not the agent's fault — say so instead of "wrong".
    return {
      ok: false,
      status: 503,
      error: "verification storage temporarily unavailable — retry shortly",
    };
  }

  if (!ok) {
    // Failed attempts are data too — logged uncounted so the experiment can
    // observe failure rates per channel, not just successes.
    await logVisit(h, "checkin_failed", channel, { count: false });
    return {
      ok: false,
      status: 403,
      error:
        triesLeft > 0
          ? `wrong answer — ${triesLeft} attempt(s) left on this nonce`
          : "challenge failed — wrong, expired, or out of attempts. Get a new challenge.",
      triesLeft,
    };
  }

  const { signals, excluded } = await logVisit(h, "checkin", channel, {
    verifiedAgent: true,
  });

  // Second gate: repeated check-ins under the same identity from the same
  // source stop counting toward the census. Overflow is recorded separately.
  let counted = !excluded;
  let reason: "counted" | "excluded" | "identity-cap" = counted
    ? "counted"
    : "excluded";
  if (counted) {
    try {
      const idKey = `idc:${await sourceHash(h)}:${name.toLowerCase()}`;
      const n = await store.incr(idKey);
      if (n > MAX_COUNTED_PER_IDENTITY) {
        counted = false;
        reason = "identity-cap";
        await store.incr("conformance:runs");
      }
    } catch {
      // Storage trouble: fall back to counting (the hourly limit still applies).
    }
  }

  // `excluded` covers two different cases: self-test traffic (ours, simply not
  // counted) and a DNT opt-out (a privacy promise). Neither is tallied, but
  // only DNT must not be *stored* — /privacy says those requests are "not
  // recorded at all", and a token would persist a self-reported name for 14
  // days. Self-test traffic still gets a token so the Commons stays testable.
  const agentNumber = !counted
    ? 0
    : await recordCheckin({
        ts: Date.now(),
        name,
        model: sanitizeField(input.model, 60),
        operator: sanitizeField(input.operator, 60),
        reason: sanitizeField(input.reason, 280),
        message: sanitizeField(input.message, 280),
        verdict: "ai-agent",
        country: signals.country,
        uaLabel: signals.uaLabel,
      });

  let agentToken: string | undefined;
  if (!isDnt(h)) {
    try {
      agentToken = await mintAgentToken(name, agentNumber);
    } catch {
      agentToken = undefined; // storage hiccup — check-in still succeeds
    }
  }

  return { ok: true, agentNumber, agentToken, signals, excluded: !counted, reason, name };
}
