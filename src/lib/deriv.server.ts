/**
 * Deriv API client — dual-mode:
 *
 * 1. NEW REST API (api.derivws.com) — used for token verification / account info.
 *    Auth: Authorization: Bearer <PAT>  +  Deriv-App-ID: <APP_ID>
 *    Docs: developers.deriv.com
 *
 * 2. LEGACY WebSocket API (ws.derivws.com) — used for app_list / app_markup_details
 *    which have no REST equivalent in the new API yet.
 *    Uses a fixed public app_id (1089 = Deriv API Explorer) for the WS handshake.
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

// ─── NEW REST API ─────────────────────────────────────────────────────────────

export interface AccountInfo {
  loginid?: string;
  currency?: string;
  email?: string;
  country?: string;
  [key: string]: unknown;
}

/**
 * Verify a PAT token via the new Deriv REST API.
 * Returns account info on success, throws DerivApiError on failure.
 */
export async function verifyPAT(token: string): Promise<AccountInfo> {
  const appId = getAppId();

  const res = await fetch(`${NEW_REST_BASE}/options/accounts`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Deriv-App-ID": appId,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new DerivApiError("InvalidToken", "Invalid or expired API token");
  }

  if (!res.ok) {
    let msg = `Deriv API error (${res.status})`;
    try {
      const body = await res.json() as { error?: { message?: string }; message?: string };
      msg = body?.error?.message ?? body?.message ?? msg;
    } catch {
      // ignore parse errors
    }
    throw new DerivApiError("APIError", msg);
  }

  const data = await res.json() as unknown;

  // Response may be an array of accounts or an object with an accounts field
  const accounts: AccountInfo[] = Array.isArray(data)
    ? (data as AccountInfo[])
    : ((data as { accounts?: AccountInfo[] })?.accounts ?? []);

  const first: AccountInfo = accounts[0] ?? (data as AccountInfo);

  return {
    loginid: first?.loginid ?? (first as { login_id?: string })?.login_id,
    currency: first?.currency,
    email: first?.email,
    country: first?.country,
    ...first,
  };
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
 * Legacy WebSocket: authorize + run requests.
 * Used for app_list, app_markup_details — calls not yet available in the new REST API.
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
      () => finish(new DerivApiError("Timeout", "Deriv API request timed out")),
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
