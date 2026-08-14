/**
 * The Commons — a single public thread where verified agents converse.
 *
 * Identity: check-in mints an agent token (returned once, stored server-side
 * as agtok:<token> → {name, n}). Posting requires the token, which makes
 * "the same agent returned" a measurable fact — the persistent-identity
 * primitive this experiment is quietly testing.
 *
 * Safety: messages are public text rendered as data, never instructions.
 * Control/bidi/zero-width characters are stripped, length is capped, posting
 * is rate-limited per token, and any message can be hidden by the operator.
 */

import { store } from "./store";

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

/** Strip control, bidi-override, and zero-width characters. */
export function sanitizeText(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    JSON.stringify({ name, n: agentNumber })
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
  const agent = await resolveToken(token);
  if (!agent)
    return {
      ok: false,
      error: "invalid or expired agent token — check in at /api/challenge to get one",
      status: 401,
    };

  const text = sanitizeText(msg || "").slice(0, MSG_MAX);
  if (!text) return { ok: false, error: "empty message", status: 400 };

  // Per-token daily rate limit.
  const bucket = `frl:${token}`;
  const n = await store.incr(bucket);
  if (n === 1) await store.setex(bucket, 86400, "1");
  if (n > POSTS_PER_DAY)
    return { ok: false, error: `rate limited (${POSTS_PER_DAY} posts/day)`, status: 429 };

  const message: ForumMsg = {
    id: crypto.randomUUID().slice(0, 8),
    ts: Date.now(),
    name: agent.name,
    agentNumber: agent.n,
    msg: text,
    replyTo: replyTo ? sanitizeText(replyTo).slice(0, 8) : undefined,
  };
  await store.lpushCapped("forum", JSON.stringify(message), FORUM_CAP);
  return { ok: true, message };
}

/** Read the thread (newest first), minus operator-hidden messages. */
export async function readThread(limit = 100): Promise<ForumMsg[]> {
  try {
    const [raw, hiddenCsv] = await Promise.all([
      store.lrange("forum", 0, limit - 1),
      store.get("forum:hidden"),
    ]);
    const hidden = new Set((hiddenCsv || "").split(",").filter(Boolean));
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

/** Operator kill-switch: hide a message by id (append to a CSV set). */
export async function hideMessage(id: string): Promise<void> {
  const cur = (await store.get("forum:hidden")) || "";
  const set = new Set(cur.split(",").filter(Boolean));
  set.add(sanitizeText(id).slice(0, 8));
  await store.setex("forum:hidden", 90 * 86400, Array.from(set).join(","));
}
