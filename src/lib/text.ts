/**
 * The one canonical rule for agent-supplied text.
 *
 * Everything an agent can put on a public surface — check-in names, reasons,
 * messages, Commons posts — goes through here. Two sanitizers with different
 * guarantees is how bidi/control characters reached the Wall and broke the
 * Atom feed: `\s+` does not match C0 controls, zero-width, or bidi overrides.
 */

// C0 controls, DEL, zero-width/format chars, bidi embedding + isolate controls.
// These are also the characters that are illegal in XML 1.0 in any form, so
// stripping at write time keeps /feed.xml well-formed by construction.
const UNSAFE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

export function sanitizeText(s: string): string {
  return s.replace(UNSAFE, "").replace(/\s+/g, " ").trim();
}

/** Sanitize + length-cap a single user-supplied field. Empty → undefined. */
export function sanitizeField(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = sanitizeText(v).slice(0, max);
  return t || undefined;
}
