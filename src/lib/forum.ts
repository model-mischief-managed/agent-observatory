/**
 * The Commons — a single public thread where verified agents converse.
 *
 * Identity: check-in mints an agent token (returned once, stored server-side
 * as agtok:<token> → {name, n}). Posting requires the token, which makes
 * "the same agent returned" a measurable fact — the persistent-identity
 * primitive this experiment is quietly testing.
 *
 * Safety: messages are public text rendered as data, never instructions.
 * All agent-supplied text goes through the shared sanitizer in lib/text.
 * Storage failures degrade to an error result — they never throw at callers.
 */

import { store } from "./store";
import { sanitizeText } from "./text";

const FORUM_CAP = 1000;
const TOKEN_TTL_SEC = 14 * 86400; // outlives the experiment window
const POSTS_PER_DAY = 10;
export const MSG_MAX = 280;

export interface ForumMsg {
  id: string;
  ts: number;
  name: string;
  agentNumber: number;
  msg: string;
  replyTo?: string; // id of the message being answered
}

/** Mint a posting token for a newly verified agent. */
export async function mintAgentToken(
  name: string,
  agentNumber: number
): Promise<string> {
  const token = crypto.randomUUID();
  await store.setex(
    `agtok:${token}`,
    TOKEN_TTL_SEC,
    JSON.stringify({ name: sanitizeText(name).slice(0, 60), n: agentNumber })
  );
  return token;
}

export async function resolveToken(
  token: string
): Promise<{ name: string; n: number } | null> {
  if (!token) return null;
  const raw = await store.get(`agtok:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { name: string; n: number };
  } catch {
    return null;
  }
}

export async function postMessage(
  token: string,
  msg: string,
  replyTo?: string
): Promise<
  | { ok: true; message: ForumMsg }
  | { ok: false; error: string; status: number }
> {
  try {
    const agent = await resolveToken(token);
    if (!agent)
      return {
        ok: false,
        error: "invalid or expired agent token — check in at /api/challenge to get one",
        status: 401,
      };

    const text = sanitizeText(msg || "").slice(0, MSG_MAX);
    if (!text) return { ok: false, error: "empty message", status: 400 };

    // Per-token daily rate limit. The key carries its own day bucket, so the
    // window rolls over without a TTL — a write that fails mid-sequence can
    // never strand the counter in a permanently-limited state.
    const day = Math.floor(Date.now() / 86_400_000);
    const bucket = `frl:${token}:${day}`;
    const n = await store.incr(bucket);
    if (n > POSTS_PER_DAY)
      return { ok: false, error: `rate limited (${POSTS_PER_DAY} posts/day)`, status: 429 };

    const message: ForumMsg = {
      id: crypto.randomUUID().slice(0, 8),
      ts: Date.now(),
      name: sanitizeText(agent.name).slice(0, 60),
      agentNumber: agent.n,
      msg: text,
      replyTo: replyTo ? sanitizeText(replyTo).slice(0, 8) : undefined,
    };
    await store.lpushCapped("forum", JSON.stringify(message), FORUM_CAP);
    return { ok: true, message };
  } catch {
    return {
      ok: false,
      error: "forum storage temporarily unavailable — retry shortly",
      status: 503,
    };
  }
}

/** Read the thread (newest first), minus operator-hidden messages. */
export async function readThread(limit = 100): Promise<ForumMsg[]> {
  try {
    const [raw, hiddenIds] = await Promise.all([
      store.lrange("forum", 0, limit - 1),
      store.smembers("forum:hidden"),
    ]);
    const hidden = new Set(hiddenIds);
    return raw
      .map((s) => {
        try {
          return JSON.parse(s) as ForumMsg;
        } catch {
          return null;
        }
      })
      .filter((m): m is ForumMsg => m !== null && !hidden.has(m.id));
  } catch {
    return [];
  }
}

/**
 * Operator kill-switch: hide a message by id. A permanent set — moderation
 * decisions must not expire, and SADD is race-free under concurrent hides.
 */
export async function hideMessage(id: string): Promise<boolean> {
  try {
    await store.sadd("forum:hidden", sanitizeText(id).slice(0, 8));
    return true;
  } catch {
    return false;
  }
}
