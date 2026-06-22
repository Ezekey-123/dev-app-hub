/**
 * Deriv API client — two modes:
 *
 * A. NEW REST API (api.derivws.com/trading/v1)
 *    Auth: Authorization: Bearer <PAT>  +  Deriv-App-ID header
 *    Used for: token verification (new-platform PATs)
 *
 * B. LEGACY WebSocket API (ws.derivws.com/websockets/v3?app_id=1089)
 *    Used for: app_list, oauth_apps, app_markup_details
 *    Works with: old-format 15-char PATs from app.deriv.com
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
 * Works ONLY with old-format 15-char PATs from app.deriv.com.
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
 * Verify a PAT against the new Deriv REST API.
 *
 * Uses GET /trading/v1/options/accounts:
 *  - 200 (with or without accounts) → token is valid
 *  - 401 → invalid/expired token
 *  - 403 → insufficient scope
 *  - other error → show raw response text
 *
 * New-platform PATs (from developers.deriv.com) only work here,
 * not with the legacy WebSocket authorize call.
 */
export async function verifyPAT(token: string): Promise<AccountInfo> {
  const appId = getAppId();

  let res: Response;
  try {
    res = await fetch(`${NEW_REST_BASE}/options/accounts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deriv-App-ID": appId,
        Accept: "application/json",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DerivApiError("NetworkError", `Could not reach Deriv API: ${msg}`);
  }

  // Parse response body (may or may not be JSON)
  let bodyText = "";
  let bodyJson: unknown = null;
  try {
    bodyText = await res.text();
    if (bodyText) bodyJson = JSON.parse(bodyText);
  } catch { /* keep bodyText, bodyJson stays null */ }

  if (res.ok) {
    // 200 — token is valid regardless of whether accounts array is empty
    const accounts: AccountInfo[] = Array.isArray(bodyJson)
      ? (bodyJson as AccountInfo[])
      : ((bodyJson as { accounts?: AccountInfo[] } | null)?.accounts ?? []);
    const first = accounts[0] ?? {};
    return {
      loginid: (first.loginid ?? (first as { login_id?: string }).login_id) as string | undefined,
      currency: first.currency as string | undefined,
      email: first.email as string | undefined,
      country: first.country as string | undefined,
    };
  }

  // Error response — extract the most useful message
  let message: string;
  if (bodyJson && typeof bodyJson === "object") {
    const b = bodyJson as { error?: { message?: string }; message?: string };
    message = b?.error?.message ?? b?.message ?? bodyText;
  } else {
    message = bodyText || `Deriv API returned HTTP ${res.status}`;
  }

  if (res.status === 401) {
    throw new DerivApiError("InvalidToken", `Invalid or expired token: ${message}`);
  }
  if (res.status === 403) {
    throw new DerivApiError("Forbidden", `Token lacks required permission: ${message}`);
  }
  throw new DerivApiError("APIError", `Deriv API error (${res.status}): ${message}`);
}
