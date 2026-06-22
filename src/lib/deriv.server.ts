/**
 * Deriv API client — dual-mode:
 *
 * 1. NEW REST API (api.derivws.com) — for token verification.
 *    Auth: Authorization: Bearer <PAT>  +  Deriv-App-ID: <APP_ID>
 *
 * 2. LEGACY WebSocket API (ws.derivws.com) — for app_list / app_markup_details
 *    and as a universal fallback for token verification.
 *    Uses app_id=1089 (Deriv API Explorer) for the WS handshake.
 */

const NEW_REST_BASE = "https://api.derivws.com/trading/v1";
const LEGACY_WS_URL = "wss://ws.derivws.com/websockets/v3";
const LEGACY_WS_APP_ID = "1089";

export interface DerivError {
  code: string;
  message: string;
  details?: unknown;
}

export class DerivApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DerivApiError";
  }
}

interface DerivResponse {
  req_id?: number;
  msg_type: string;
  error?: DerivError;
  [key: string]: unknown;
}

const DEFAULT_REDIRECT_URI = "https://app.appdrv.site/callback";

function getAppId(): string {
  const id = process.env.DERIV_APP_ID;
  if (!id) throw new Error("DERIV_APP_ID env var is not configured");
  return id;
}

export function getDerivAppId(): string {
  return getAppId();
}

export function getDerivRedirectUri(): string {
  return process.env.DERIV_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
}

// ─── LEGACY WEBSOCKET API ─────────────────────────────────────────────────────

async function openWebSocket(url: string): Promise<import("ws").WebSocket> {
  if (typeof WebSocket !== "undefined") {
    return new WebSocket(url) as unknown as import("ws").WebSocket;
  }
  const { WebSocket: WS } = await import("ws");
  return new WS(url);
}

function dataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return String(data);
}

/**
 * Legacy WebSocket: authorize then run requests.
 * Used for app_list, app_markup_details, and universal token verification.
 */
export async function derivRequest(
  token: string,
  requests: Array<Record<string, unknown>>,
  opts: { timeoutMs?: number } = {},
): Promise<DerivResponse[]> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const url = `${LEGACY_WS_URL}?app_id=${LEGACY_WS_APP_ID}&l=EN`;

  const ws = await openWebSocket(url);

  return new Promise<DerivResponse[]>((resolve, reject) => {
    let settled = false;
    const results: DerivResponse[] = [];
    let nextReqId = 1;
    let authorized = false;
    const queue = [...requests];

    const finish = (err: Error | null, value?: DerivResponse[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value ?? []);
    };

    const timer = setTimeout(
      () => finish(new DerivApiError("Timeout", "Deriv API request timed out after 15s")),
      timeoutMs,
    );

    const send = (payload: Record<string, unknown>) => {
      const req_id = nextReqId++;
      ws.send(JSON.stringify({ ...payload, req_id }));
    };

    ws.on("open", () => {
      send({ authorize: token });
    });

    ws.on("message", (data: unknown) => {
      let msg: DerivResponse;
      try {
        msg = JSON.parse(dataToString(data));
      } catch {
        return;
      }
      if (msg.error) {
        finish(new DerivApiError(msg.error.code, msg.error.message, msg.error.details));
        return;
      }
      if (!authorized && msg.msg_type === "authorize") {
        authorized = true;
        if (queue.length === 0) {
          finish(null, results);
          return;
        }
        for (const req of queue) send(req);
        return;
      }
      if (authorized) {
        results.push(msg);
        if (results.length >= queue.length) {
          finish(null, results);
        }
      }
    });

    ws.on("error", (err: Error) => {
      finish(new DerivApiError("WSError", `Deriv WebSocket error: ${err.message}`));
    });

    ws.on("close", () => {
      if (!settled) {
        finish(new DerivApiError("WSClosed", "Deriv WebSocket closed unexpectedly"));
      }
    });
  });
}

/** Run a single authorized request on the legacy WebSocket and return its response. */
export async function derivOne(
  token: string,
  request: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<DerivResponse> {
  const [res] = await derivRequest(token, [request], opts);
  return res;
}

// ─── NEW REST API ─────────────────────────────────────────────────────────────

export interface AccountInfo {
  loginid?: string;
  currency?: string;
  email?: string;
  country?: string;
  [key: string]: unknown;
}

/**
 * Verify a PAT token using the legacy WebSocket authorize call.
 *
 * This works universally for all Deriv PATs regardless of scope or account type.
 * The authorize response itself contains account info (loginid, currency, etc).
 */
export async function verifyPAT(token: string): Promise<AccountInfo> {
  // Use legacy WS with authorize-only (empty request queue) — minimal scope needed.
  // This is universally compatible with all Deriv PAT types.
  const url = `${LEGACY_WS_URL}?app_id=${LEGACY_WS_APP_ID}&l=EN`;
  const ws = await openWebSocket(url);

  return new Promise<AccountInfo>((resolve, reject) => {
    let settled = false;

    const finish = (err: Error | null, value?: AccountInfo) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value ?? {});
    };

    const timer = setTimeout(
      () => finish(new DerivApiError("Timeout", "Token verification timed out. Check your connection.")),
      15_000,
    );

    ws.on("open", () => {
      ws.send(JSON.stringify({ authorize: token, req_id: 1 }));
    });

    ws.on("message", (data: unknown) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(dataToString(data)); }
      catch { return; }

      if (msg.error) {
        const err = msg.error as DerivError;
        finish(new DerivApiError(err.code, err.message));
        return;
      }

      if (msg.msg_type === "authorize") {
        const auth = (msg.authorize ?? {}) as Record<string, unknown>;
        finish(null, {
          loginid: auth.loginid as string | undefined,
          currency: auth.currency as string | undefined,
          email: auth.email as string | undefined,
          country: auth.country as string | undefined,
        });
      }
    });

    ws.on("error", (err: Error) => {
      finish(new DerivApiError("WSError", `Connection error: ${err.message}`));
    });

    ws.on("close", () => {
      if (!settled) finish(new DerivApiError("WSClosed", "Connection closed unexpectedly"));
    });
  });
}
