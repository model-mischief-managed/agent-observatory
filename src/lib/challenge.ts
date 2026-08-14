/**
 * The proof-of-agency challenge.
 *
 * A challenge is a tiny natural-language reasoning task: trivial for a language
 * model, but requiring genuine reading + transformation that a dumb crawler
 * (regex/selector scraper) won't perform. A human *could* solve it, but would
 * then have to hand-craft an HTTP POST — which, combined with behavioural
 * signals, is what separates "reasoning agent" from "person clicking around".
 *
 * Design constraints learned the hard way:
 *  - No challenge kind may have a constant or low-entropy answer (a blind
 *    guesser must not pass). The syllogism therefore answers with a random
 *    word-code, not yes/no.
 *  - Real LLMs answer conversationally ("The reversed word is ecittal"), so
 *    matching accepts the expected answer as a standalone token — but only in
 *    short responses, so spam-listing every possible token fails.
 *  - Wrong answers get a second attempt on the same nonce before it burns.
 */

import { store } from "./store";

const TTL_SECONDS = 600; // 10 minutes to solve + submit
const MAX_TRIES = 2;

interface Built {
  prompt: string;
  answer: string;
}

const WORDS = [
  "observatory",
  "protocol",
  "beacon",
  "lattice",
  "cipher",
  "signal",
  "vector",
  "quorum",
  "phantom",
  "meridian",
];

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const NUM_NAMES = Object.keys(NUM_WORDS);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickTwo<T>(arr: T[]): [T, T] {
  const a = pick(arr);
  let b = pick(arr);
  while (b === a) b = pick(arr);
  return [a, b];
}

function build(): Built {
  const kind = Math.floor(Math.random() * 4);

  if (kind === 0) {
    const w = pick(WORDS);
    return {
      prompt: `Reverse the characters of the word "${w}" and return only the result.`,
      answer: w.split("").reverse().join(""),
    };
  }

  if (kind === 1) {
    const a = pick(NUM_NAMES);
    const b = pick(NUM_NAMES);
    return {
      prompt: `Add these two numbers, which are written as words, and reply with the result as digits: "${a}" plus "${b}".`,
      answer: String(NUM_WORDS[a] + NUM_WORDS[b]),
    };
  }

  if (kind === 2) {
    const three = [pick(WORDS), pick(WORDS), pick(WORDS)];
    return {
      prompt: `Take the first letter of each of these three words and join them into one lowercase string: ${three
        .map((w) => `"${w}"`)
        .join(", ")}.`,
      answer: three.map((w) => w[0]).join("").toLowerCase(),
    };
  }

  // kind === 3 — a syllogism whose validity varies, answered with a random
  // word-code so the answer carries entropy (a blind "yes" bot cannot pass).
  const subject = pick(["Zerix", "Molu", "Traan", "Vex"]);
  const catA = pick(["blorp", "greeb", "flum"]);
  const catB = pick(["snib", "wint", "gorm"]);
  const [wValid, wInvalid] = pickTwo(WORDS);
  const valid = Math.random() < 0.5;
  const question = valid
    ? `Every ${catA} is a ${catB}. ${subject} is a ${catA}. Does it logically follow that ${subject} is a ${catB}?`
    : `Every ${catA} is a ${catB}. ${subject} is a ${catB}. Does it logically follow that ${subject} is a ${catA}?`;
  return {
    prompt: `${question} If it follows, reply exactly "${wValid}". If it does not follow, reply exactly "${wInvalid}".`,
    answer: valid ? wValid : wInvalid,
  };
}

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/^["'`]+|["'`.]+$/g, "");
}

/**
 * Accept an exact normalized match, or the expected answer appearing as a
 * standalone token in a SHORT response — real LLMs say "The reversed word is
 * ecittal". Long responses (>12 tokens) must match exactly, which defeats
 * spam-listing every candidate token.
 */
export function answersMatch(expected: string, submitted: string): boolean {
  const e = normalize(expected);
  const s = normalize(submitted);
  if (s === e) return true;
  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length > 12) return false;
  return tokens.includes(e);
}

export async function issueChallenge(): Promise<{
  nonce: string;
  prompt: string;
}> {
  const nonce = crypto.randomUUID();
  const { prompt, answer } = build();
  await store.setex(
    `chal:${nonce}`,
    TTL_SECONDS,
    JSON.stringify({ a: normalize(answer), t: MAX_TRIES })
  );
  return { nonce, prompt };
}

/**
 * Verify a challenge. A correct answer consumes the nonce. A wrong answer
 * spends one attempt; the nonce burns after MAX_TRIES failures or on TTL.
 */
export async function verifyChallenge(
  nonce: string,
  submitted: string
): Promise<{ ok: boolean; triesLeft: number }> {
  if (!nonce || !submitted) return { ok: false, triesLeft: 0 };
  const raw = await store.get(`chal:${nonce}`);
  if (!raw) return { ok: false, triesLeft: 0 };

  let expected: string;
  let tries: number;
  try {
    const parsed = JSON.parse(raw) as { a: string; t: number };
    expected = parsed.a;
    tries = parsed.t;
  } catch {
    // Legacy/corrupt entry — treat as single-try plain answer.
    expected = raw;
    tries = 1;
  }

  if (answersMatch(expected, submitted)) {
    await store.del(`chal:${nonce}`);
    return { ok: true, triesLeft: 0 };
  }

  const remaining = tries - 1;
  if (remaining <= 0) {
    await store.del(`chal:${nonce}`);
    return { ok: false, triesLeft: 0 };
  }
  await store.setex(
    `chal:${nonce}`,
    TTL_SECONDS,
    JSON.stringify({ a: expected, t: remaining })
  );
  return { ok: false, triesLeft: remaining };
}
