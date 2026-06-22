/**
 * Minimal Deriv WebSocket client for server-only use.
 *
 * Opens a short-lived WS connection, authorizes with the user's OAuth token,
 * sends one request, awaits the matching response (by req_id), and closes.
 *
 * Uses the native global WebSocket on Cloudflare Workers / Node 22+,
 * and falls back to the `ws` npm package on Node 20 (Replit dev environment).
 */

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3";

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
 * Open a websocket, authorize, run a sequence of requests, return their
 * responses in order. Closes the socket on success or error.
 */
export async function derivRequest(
  token: string,
  requests: Array<Record<string, unknown>>,
  opts: { timeoutMs?: number } = {},
): Promise<DerivResponse[]> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const appId = getAppId();
  const url = `${DERIV_WS_URL}?app_id=${encodeURIComponent(appId)}&l=EN`;

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
      try {
        ws.close();
      } catch {
        // ignore
      }
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

/** Run a single authorized request and return its response. */
export async function derivOne(
  token: string,
  request: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<DerivResponse> {
  const [res] = await derivRequest(token, [request], opts);
  return res;
}
