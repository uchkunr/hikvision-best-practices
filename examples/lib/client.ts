// Minimal ISAPI client: HTTP Digest auth (RFC 7616 / RFC 2617), nonce reuse,
// lockout detection and ResponseStatus parsing. No dependencies.
//
// Written in erasable TypeScript so Node 22.18+ can run it directly.

import { createHash, randomBytes } from "node:crypto";

export type ClientOptions = {
  host: string; // e.g. "http://192.168.1.64"
  username: string;
  password: string;
  timeoutMs?: number;
  // Optional undici dispatcher, e.g. to trust a device's self-signed certificate.
  dispatcher?: unknown;
};

type Challenge = {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm: string;
  nc: number;
};

export class IsapiError extends Error {
  status: number;
  statusCode?: number;
  subStatusCode?: string;
  errorCode?: number;

  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message);
    this.name = "IsapiError";
    this.status = status;
    if (body) {
      this.statusCode = Number(body.statusCode);
      this.subStatusCode = body.subStatusCode as string | undefined;
      this.errorCode = body.errorCode as number | undefined;
    }
  }
}

export class LockedError extends Error {
  unlockSeconds?: number;

  constructor(unlockSeconds?: number) {
    super(`Account is locked${unlockSeconds ? `, retry in ${unlockSeconds}s` : ""}`);
    this.name = "LockedError";
    this.unlockSeconds = unlockSeconds;
  }
}

export class IsapiClient {
  readonly host: string;
  #username: string;
  #password: string;
  #timeoutMs: number;
  #dispatcher: unknown;
  #challenge: Challenge | undefined;

  constructor(options: ClientOptions) {
    this.host = options.host.replace(/\/+$/, "");
    this.#username = options.username;
    this.#password = options.password;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#dispatcher = options.dispatcher;
  }

  static fromEnv(): IsapiClient {
    const { HIK_HOST, HIK_USER, HIK_PASS } = process.env;
    if (!HIK_HOST || !HIK_USER || !HIK_PASS) {
      throw new Error("Set HIK_HOST, HIK_USER and HIK_PASS (see .env.example)");
    }
    return new IsapiClient({ host: HIK_HOST, username: HIK_USER, password: HIK_PASS });
  }

  // Sends a request and answers the Digest challenge. The body must be
  // re-sendable (string, Buffer, Uint8Array or FormData), because a stale nonce
  // means the request is sent twice.
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.host + path;
    const method = (init.method ?? "GET").toUpperCase();

    let res = await this.#send(url, method, init);
    if (res.status !== 401) return res;

    const text = await res.text();
    const lock = parseLock(text);
    if (lock) throw lock;

    const header = res.headers.get("www-authenticate") ?? "";
    if (!/^Digest\s/i.test(header)) {
      throw new IsapiError("401 without a Digest challenge", 401);
    }
    this.#challenge = parseChallenge(header);

    res = await this.#send(url, method, init);
    if (res.status === 401) {
      const retryText = await res.text();
      const retryLock = parseLock(retryText);
      if (retryLock) throw retryLock;
      this.#challenge = undefined;
      // Also returned when the account lacks permission for this resource.
      throw new IsapiError(`401 Unauthorized for ${method} ${path}`, 401);
    }
    return res;
  }

  // JSON request with ?format=json appended. Throws on a non-OK ResponseStatus.
  async json<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const sep = path.includes("?") ? "&" : "?";
    const res = await this.fetch(`${path}${sep}format=json`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseJson<T>(res, `${method} ${path}`);
  }

  // XML request. Returns the raw XML text; throws on a non-OK ResponseStatus.
  async xml(method: string, path: string, body?: string): Promise<string> {
    const res = await this.fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/xml" },
      body,
    });
    const text = await res.text();
    const code = Number(/<statusCode>(\d+)<\/statusCode>/.exec(text)?.[1] ?? 1);
    if (!res.ok || code > 1) {
      const sub = /<subStatusCode>([^<]*)<\/subStatusCode>/.exec(text)?.[1];
      throw new IsapiError(`${method} ${path} failed: ${sub ?? res.status}`, res.status, {
        statusCode: code,
        subStatusCode: sub,
      });
    }
    return text;
  }

  #send(url: string, method: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.#challenge) {
      const uri = new URL(url);
      headers.set("Authorization", this.#authorize(method, uri.pathname + uri.search));
    }
    const options: RequestInit & { dispatcher?: unknown } = {
      ...init,
      method,
      headers,
      signal: init.signal ?? AbortSignal.timeout(this.#timeoutMs),
    };
    if (this.#dispatcher) options.dispatcher = this.#dispatcher;
    return fetch(url, options);
  }

  #authorize(method: string, uri: string): string {
    const c = this.#challenge!;
    const algo = c.algorithm.toUpperCase();
    const hash = (s: string) =>
      createHash(algo.startsWith("SHA-256") ? "sha256" : "md5").update(s).digest("hex");

    c.nc += 1;
    const nc = c.nc.toString(16).padStart(8, "0");
    const cnonce = randomBytes(16).toString("hex");

    let ha1 = hash(`${this.#username}:${c.realm}:${this.#password}`);
    if (algo.endsWith("-SESS")) ha1 = hash(`${ha1}:${c.nonce}:${cnonce}`);
    const ha2 = hash(`${method}:${uri}`);

    const qop = c.qop?.split(",").map((q) => q.trim()).includes("auth") ? "auth" : undefined;
    const response = qop
      ? hash(`${ha1}:${c.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : hash(`${ha1}:${c.nonce}:${ha2}`);

    const parts = [
      `username="${this.#username}"`,
      `realm="${c.realm}"`,
      `nonce="${c.nonce}"`,
      `uri="${uri}"`,
      `algorithm=${c.algorithm}`,
      `response="${response}"`,
    ];
    if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    if (c.opaque) parts.push(`opaque="${c.opaque}"`);
    return `Digest ${parts.join(", ")}`;
  }
}

function parseChallenge(header: string): Challenge {
  const p: Record<string, string> = {};
  for (const m of header.replace(/^Digest\s+/i, "").matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]+))/g)) {
    p[m[1].toLowerCase()] = m[2] ?? m[3];
  }
  if (!p.realm || !p.nonce) throw new IsapiError("Malformed Digest challenge", 401);
  return {
    realm: p.realm,
    nonce: p.nonce,
    qop: p.qop,
    opaque: p.opaque,
    algorithm: p.algorithm ?? "MD5",
    nc: 0,
  };
}

// A locked account answers 401 with a userCheck body:
// <lockStatus>locked</lockStatus><unlockTime>seconds</unlockTime>
function parseLock(body: string): LockedError | undefined {
  if (!/<lockStatus>\s*locked\s*<\/lockStatus>/i.test(body)) return undefined;
  const seconds = Number(/<unlockTime>\s*(\d+)/i.exec(body)?.[1]);
  return new LockedError(Number.isFinite(seconds) ? seconds : undefined);
}

async function parseJson<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new IsapiError(`${what}: expected JSON, got ${text.slice(0, 120)}`, res.status);
  }
  const code = body?.statusCode;
  if (!res.ok || (typeof code === "number" && code > 1)) {
    const reason = body?.subStatusCode ?? body?.statusString ?? res.statusText;
    throw new IsapiError(`${what} failed: ${reason}`, res.status, body);
  }
  return body as T;
}

// Device time with the device's UTC offset, e.g. "2026-11-16T09:30:00+05:00".
export function isapiTime(date: Date, offsetMinutes: number): string {
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return local.toISOString().slice(0, 19) + off;
}
