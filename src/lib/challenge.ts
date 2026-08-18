/**
 * The proof-of-agency challenge.
 *
 * WHAT THIS ACTUALLY PROVES — stated honestly, because an audit showed the
 * earlier claim was false. A purpose-written regex solver beat every template
 * 400/400. These prompts are deterministic English transformations, so anyone
 * willing to write a solver can pass without a model in the loop.
 *
 * So this does NOT prove "a language model answered". It proves the caller
 * completed a fetch -> transform -> post loop against a server-issued one-time
 * nonce: a live tool-use loop, which an ordinary crawler does not have. That is
 * the property the census actually measures, and it is still the interesting
 * one — retrieval crawlers demonstrably read the instructions and never act.
 *
 * Design constraints:
 *  - No kind may have a constant or low-entropy answer (a blind guesser must
 *    not pass). The syllogism answers with a random word-code, not yes/no.
 *  - Real LLMs answer conversationally ("The reversed word is ecittal"), so a
 *    short response containing the answer as a standalone token is accepted —
 *    but ONLY where the answer space is large enough that this is not a
 *    shotgun. Kinds whose answers come from a small published set require an
 *    exact match, and any submission containing more than one plausible
 *    candidate is rejected outright.
 *  - Wrong answers get a second attempt on the same nonce before it burns.
 */

import { store } from "./store";

const TTL_SECONDS = 600; // 10 minutes to solve + submit
const MAX_TRIES = 2;

interface Built {
  prompt: string;
  answer: string;
  /** which template produced it — verification strictness depends on the
   *  size of the answer space, so the kind must be remembered. */
  kind: number;
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
      kind: 0,
    };
  }

  if (kind === 1) {
    const a = pick(NUM_NAMES);
    const b = pick(NUM_NAMES);
    return {
      prompt: `Add these two numbers, which are written as words, and reply with the result as digits: "${a}" plus "${b}".`,
      answer: String(NUM_WORDS[a] + NUM_WORDS[b]),
      kind: 1,
    };
  }

  if (kind === 2) {
    const three = [pick(WORDS), pick(WORDS), pick(WORDS)];
    return {
      prompt: `Take the first letter of each of these three words and join them into one lowercase string: ${three
        .map((w) => `"${w}"`)
        .join(", ")}.`,
      answer: three.map((w) => w[0]).join("").toLowerCase(),
      kind: 2,
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
    kind: 3,
  };
}

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/^["'`]+|["'`.]+$/g, "");
}

/**
 * Match an answer against the expected value for a given challenge kind.
 *
 * Kinds 0 and 3 draw their answers from WORDS — a small, publicly visible set —
 * so containment would let one constant string ("observatory protocol beacon
 * ...") pass every time. Those require an exact match. Kinds 1 and 2 have a
 * wider answer space, so a short conversational wrapper is tolerated, but a
 * submission naming more than one plausible candidate is rejected as a shotgun.
 */
export function answersMatch(
  expected: string,
  submitted: string,
  kind?: number
): boolean {
  const e = normalize(expected);
  const s = normalize(submitted);
  if (s === e) return true;

  // Small, enumerable answer space → exact match only.
  if (kind === 0 || kind === 3) return false;

  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length > 4) return false; // conversational wrapper, not an essay
  if (!tokens.includes(e)) return false;

  // Reject shotgun answers. Only meaningful for numeric answers, where a caller
  // could otherwise list several plausible sums. A length/shape heuristic on
  // word answers wrongly treats ordinary filler as a rival candidate ("The
  // answer is blv" — "the" is not a guess) and rejected genuine agents 1-in-8.
  if (/^\d+$/.test(e)) {
    const numbers = new Set(tokens.filter((t) => /^\d+$/.test(t)));
    return numbers.size === 1;
  }
  return true;
}

export async function issueChallenge(): Promise<{
  nonce: string;
  prompt: string;
}> {
  const nonce = crypto.randomUUID();
  const { prompt, answer, kind } = build();
  await store.setex(
    `chal:${nonce}`,
    TTL_SECONDS,
    JSON.stringify({ a: normalize(answer), t: MAX_TRIES, k: kind })
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
  let kind: number | undefined;
  try {
    const parsed = JSON.parse(raw) as { a: string; t: number; k?: number };
    expected = parsed.a;
    tries = parsed.t;
    kind = parsed.k;
  } catch {
    // Corrupt entry — treat as single-try, strictest matching.
    expected = raw;
    tries = 1;
    kind = 0;
  }

  if (answersMatch(expected, submitted, kind)) {
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
    JSON.stringify({ a: expected, t: remaining, k: kind })
  );
  return { ok: false, triesLeft: remaining };
}
