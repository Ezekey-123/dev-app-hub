/**
 * Minimal Deriv WebSocket client for server-only use.
 *
 * Opens a short-lived WS connection, authorizes with the user's OAuth token,
 * sends one request, awaits the matching response (by req_id), and closes.
 *
 * Uses the global WebSocket API which is available on Cloudflare Workers
 * and Node 22+.
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

function getAppId(): string {
  const id = process.env.DERIV_APP_ID;
  if (!id) throw new Error("DERIV_APP_ID env var is not configured");
  return id;
}

export function getDerivAppId(): string {
  return getAppId();
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

  return new Promise<DerivResponse[]>((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url);
    const results: DerivResponse[] = [];
    const pending = new Map<number, Record<string, unknown>>();
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
      pending.set(req_id, payload);
      ws.send(JSON.stringify({ ...payload, req_id }));
    };

    ws.addEventListener("open", () => {
      // Authorize first
      send({ authorize: token });
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      let msg: DerivResponse;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : "");
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
        // Send all queued requests
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

    ws.addEventListener("error", () => {
      finish(new DerivApiError("WSError", "Deriv WebSocket connection error"));
    });

    ws.addEventListener("close", () => {
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
