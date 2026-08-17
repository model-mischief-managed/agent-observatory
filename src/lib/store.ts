/**
 * Tiny storage layer with three backends, chosen from the env at module load:
 *
 *  1. "redis-rest" — Upstash-style REST API (KV_REST_API_* / UPSTASH_* vars,
 *     or derived from an *.upstash.io REDIS_URL). One HTTPS call per command,
 *     pipelining supported. Edge-safe.
 *  2. "redis-tcp" — any standard Redis over (TLS) TCP via the official
 *     `redis` client (REDIS_URL / KV_URL). This is what the Vercel
 *     Marketplace "Redis Cloud" integration provides.
 *  3. "memory" — per-process fallback so local dev runs with nothing attached.
 *
 * The app only touches the small `store` facade below, so backends stay
 * swappable and the call sites stay clean.
 */

import { createClient, type RedisClientType } from "redis";

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

const REST_URL_ENV =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REST_TOKEN_ENV =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const TCP_URL = process.env.REDIS_URL || process.env.KV_URL || "";

function resolveBackend(): {
  mode: "redis-rest" | "redis-tcp" | "memory";
  restUrl: string;
  restToken: string;
} {
  if (REST_URL_ENV && REST_TOKEN_ENV)
    return { mode: "redis-rest", restUrl: REST_URL_ENV, restToken: REST_TOKEN_ENV };
  // Upstash TCP URLs carry the REST token as the password and expose REST at
  // https://<host>; other providers (e.g. Redis Cloud) are plain TCP only.
  const m = TCP_URL.match(/^rediss?:\/\/[^:]*:([^@]+)@([^:/?]+)/);
  if (m && m[2].endsWith(".upstash.io"))
    return { mode: "redis-rest", restUrl: `https://${m[2]}`, restToken: m[1] };
  if (TCP_URL) return { mode: "redis-tcp", restUrl: "", restToken: "" };
  return { mode: "memory", restUrl: "", restToken: "" };
}

const backend = resolveBackend();
export const STORE_MODE = backend.mode;

// ---------------------------------------------------------------------------
// REST transport (Upstash-compatible)
// ---------------------------------------------------------------------------

async function cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
  const res = await fetch(backend.restUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${backend.restToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.map(String)),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`redis ${args[0]} failed: ${res.status}`);
  }
  const json = (await res.json()) as { result: T; error?: string };
  if (json.error) throw new Error(`redis ${args[0]}: ${json.error}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// TCP transport (standard Redis) — lazy singleton, reused across warm
// serverless invocations. connect() is guarded so concurrent requests share
// one connection attempt.
// ---------------------------------------------------------------------------

let tcpClient: RedisClientType | null = null;
let tcpConnecting: Promise<RedisClientType> | null = null;

async function tcp(): Promise<RedisClientType> {
  if (tcpClient?.isOpen) return tcpClient;
  if (!tcpConnecting) {
    tcpConnecting = (async () => {
      const c = createClient({
        url: TCP_URL,
        socket: { connectTimeout: 5000 },
      }) as RedisClientType;
      c.on("error", () => {}); // surfaced via thrown command errors instead
      await c.connect();
      tcpClient = c;
      return c;
    })().finally(() => {
      tcpConnecting = null;
    });
  }
  return tcpConnecting;
}

// ---------------------------------------------------------------------------
// In-memory fallback (per-process; fine for local dev only)
// ---------------------------------------------------------------------------

type MemVal =
  | { t: "str"; v: string; exp?: number }
  | { t: "list"; v: string[] }
  | { t: "hash"; v: Record<string, string> }
  | { t: "set"; v: Set<string> };

const mem = new Map<string, MemVal>();

function live(key: string): MemVal | undefined {
  const e = mem.get(key);
  if (!e) return undefined;
  if (e.t === "str" && e.exp && Date.now() > e.exp) {
    mem.delete(key);
    return undefined;
  }
  return e;
}

// ---------------------------------------------------------------------------
// Public API — the small surface the app actually uses
// ---------------------------------------------------------------------------

export const store = {
  async incr(key: string): Promise<number> {
    if (STORE_MODE === "redis-rest") return cmd<number>("INCR", key);
    if (STORE_MODE === "redis-tcp") return (await tcp()).incr(key);
    const e = live(key);
    const n = (e && e.t === "str" ? parseInt(e.v, 10) || 0 : 0) + 1;
    // Preserve any TTL set by setex — Redis INCR keeps the TTL, so must we.
    mem.set(key, { t: "str", v: String(n), exp: e?.t === "str" ? e.exp : undefined });
    return n;
  },

  async get(key: string): Promise<string | null> {
    if (STORE_MODE === "redis-rest") return cmd<string | null>("GET", key);
    if (STORE_MODE === "redis-tcp") return (await tcp()).get(key);
    const e = live(key);
    return e && e.t === "str" ? e.v : null;
  },

  async setex(key: string, ttlSec: number, val: string): Promise<void> {
    if (STORE_MODE === "redis-rest") {
      await cmd("SET", key, val, "EX", ttlSec);
      return;
    }
    if (STORE_MODE === "redis-tcp") {
      await (await tcp()).set(key, val, {
        expiration: { type: "EX", value: ttlSec },
      });
      return;
    }
    mem.set(key, { t: "str", v: val, exp: Date.now() + ttlSec * 1000 });
  },

  async del(key: string): Promise<void> {
    if (STORE_MODE === "redis-rest") {
      await cmd("DEL", key);
      return;
    }
    if (STORE_MODE === "redis-tcp") {
      await (await tcp()).del(key);
      return;
    }
    mem.delete(key);
  },

  /** Push onto a capped list (newest first). */
  async lpushCapped(key: string, val: string, cap: number): Promise<void> {
    if (STORE_MODE === "redis-rest") {
      await cmd("LPUSH", key, val);
      await cmd("LTRIM", key, 0, cap - 1);
      return;
    }
    if (STORE_MODE === "redis-tcp") {
      const c = await tcp();
      await c.multi().lPush(key, val).lTrim(key, 0, cap - 1).exec();
      return;
    }
    const e = live(key);
    const list = e && e.t === "list" ? e.v : [];
    list.unshift(val);
    mem.set(key, { t: "list", v: list.slice(0, cap) });
  },

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (STORE_MODE === "redis-rest")
      return (await cmd<string[]>("LRANGE", key, start, stop)) || [];
    if (STORE_MODE === "redis-tcp")
      return (await tcp()).lRange(key, start, stop);
    const e = live(key);
    if (!e || e.t !== "list") return [];
    const end = stop === -1 ? e.v.length : stop + 1;
    return e.v.slice(start, end);
  },

  /** Add to a set. Returns true if the member was new. */
  async sadd(key: string, member: string): Promise<boolean> {
    if (STORE_MODE === "redis-rest")
      return (await cmd<number>("SADD", key, member)) === 1;
    if (STORE_MODE === "redis-tcp")
      return (await (await tcp()).sAdd(key, member)) === 1;
    const e = live(key);
    const s = e && e.t === "set" ? e.v : new Set<string>();
    const isNew = !s.has(member);
    s.add(member);
    mem.set(key, { t: "set", v: s });
    return isNew;
  },

  async scard(key: string): Promise<number> {
    if (STORE_MODE === "redis-rest") return (await cmd<number>("SCARD", key)) || 0;
    if (STORE_MODE === "redis-tcp") return (await tcp()).sCard(key);
    const e = live(key);
    return e && e.t === "set" ? e.v.size : 0;
  },

  async smembers(key: string): Promise<string[]> {
    if (STORE_MODE === "redis-rest") return (await cmd<string[]>("SMEMBERS", key)) || [];
    if (STORE_MODE === "redis-tcp") return (await tcp()).sMembers(key);
    const e = live(key);
    return e && e.t === "set" ? Array.from(e.v) : [];
  },

  /** Increment a field inside a hash used as a tally map. */
  async hincr(key: string, field: string): Promise<void> {
    if (STORE_MODE === "redis-rest") {
      await cmd("HINCRBY", key, field, 1);
      return;
    }
    if (STORE_MODE === "redis-tcp") {
      await (await tcp()).hIncrBy(key, field, 1);
      return;
    }
    const e = live(key);
    const h = e && e.t === "hash" ? e.v : {};
    h[field] = String((parseInt(h[field] || "0", 10) || 0) + 1);
    mem.set(key, { t: "hash", v: h });
  },

  async hgetall(key: string): Promise<Record<string, string>> {
    if (STORE_MODE === "redis-rest") {
      const flat = (await cmd<string[]>("HGETALL", key)) || [];
      const out: Record<string, string> = {};
      for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
      return out;
    }
    if (STORE_MODE === "redis-tcp")
      return { ...(await (await tcp()).hGetAll(key)) };
    const e = live(key);
    return e && e.t === "hash" ? { ...e.v } : {};
  },

  /**
   * Execute a batch of WRITE commands in one round trip (REST pipeline or a
   * TCP MULTI). Supports the small command set the logger uses; memory mode
   * replays the batch through the local methods.
   */
  async pipe(commands: (string | number)[][]): Promise<void> {
    if (commands.length === 0) return;
    if (STORE_MODE === "redis-rest") {
      const res = await fetch(`${backend.restUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${backend.restToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commands.map((c) => c.map(String))),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`redis pipeline failed: ${res.status}`);
      return;
    }
    if (STORE_MODE === "redis-tcp") {
      const c = await tcp();
      const m = c.multi();
      for (const cmdArr of commands) {
        const [op, key, ...args] = cmdArr.map(String);
        switch (op) {
          case "INCR": m.incr(key); break;
          case "SADD": m.sAdd(key, args[0]); break;
          case "HINCRBY": m.hIncrBy(key, args[0], Number(args[1]) || 1); break;
          case "LPUSH": m.lPush(key, args[0]); break;
          case "LTRIM": m.lTrim(key, Number(args[0]), Number(args[1])); break;
        }
      }
      await m.exec();
      return;
    }
    for (const c of commands) {
      const [op, key, ...args] = c.map(String);
      switch (op) {
        case "INCR":
          await store.incr(key);
          break;
        case "SADD":
          await store.sadd(key, args[0]);
          break;
        case "HINCRBY":
          await store.hincr(key, args[0]);
          break;
        case "LPUSH":
          await store.lpushCapped(key, args[0], Number.MAX_SAFE_INTEGER);
          break;
        case "LTRIM": {
          const e = live(key);
          if (e && e.t === "list")
            mem.set(key, { t: "list", v: e.v.slice(Number(args[0]), Number(args[1]) + 1) });
          break;
        }
      }
    }
  },
};
