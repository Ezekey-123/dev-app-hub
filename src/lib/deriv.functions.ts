/**
 * Server functions exposed to the client. Token never leaves the cookie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginSchema = z.object({
  token: z.string().min(10).max(2048),
  loginid: z.string().max(64).optional(),
  currency: z.string().max(16).optional(),
});

const appIdSchema = z.object({
  appId: z.number().int().positive(),
});

export const loginWithDerivToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }) => {
    const { derivOne, DerivApiError } = await import("./deriv.server");
    const { writeSession } = await import("./session.server");
    // Verify the token works before persisting it.
    try {
      const res = await derivOne(data.token, { authorize: data.token });
      const auth = res.authorize as Record<string, unknown> | undefined;
      writeSession({
        token: data.token,
        loginid: (auth?.loginid as string | undefined) ?? data.loginid,
        currency: (auth?.currency as string | undefined) ?? data.currency,
      });
      return { ok: true as const };
    } catch (err) {
      if (err instanceof DerivApiError) {
        return { ok: false as const, error: err.message };
      }
      return { ok: false as const, error: "Failed to verify Deriv token" };
    }
  });

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const { readSession } = await import("./session.server");
  const { derivOne, DerivApiError, getDerivAppId } = await import("./deriv.server");
  const sess = readSession();
  if (!sess) return { authenticated: false as const, appId: getDerivAppId() };
  try {
    const res = await derivOne(sess.token, { get_settings: 1 });
    const settings = (res.get_settings as Record<string, unknown> | undefined) ?? {};
    return {
      authenticated: true as const,
      appId: getDerivAppId(),
      loginid: sess.loginid,
      currency: sess.currency,
      email: settings.email as string | undefined,
      country: settings.country as string | undefined,
    };
  } catch (err) {
    if (err instanceof DerivApiError && err.code === "InvalidToken") {
      const { clearSession } = await import("./session.server");
      clearSession();
      return { authenticated: false as const, appId: getDerivAppId() };
    }
    return { authenticated: true as const, appId: getDerivAppId(), loginid: sess.loginid };
  }
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSession } = await import("./session.server");
  clearSession();
  return { ok: true as const };
});

export const listApps = createServerFn({ method: "GET" }).handler(async () => {
  const { readSession } = await import("./session.server");
  const { derivRequest, DerivApiError } = await import("./deriv.server");
  const sess = readSession();
  if (!sess) throw new Error("UNAUTHENTICATED");
  try {
    const [appList, oauthApps] = await derivRequest(sess.token, [
      { app_list: 1 },
      { oauth_apps: 1 },
    ]);
    return {
      apps: (appList.app_list as unknown[]) ?? [],
      oauth_apps: (oauthApps.oauth_apps as unknown[]) ?? [],
      raw: { app_list: appList, oauth_apps: oauthApps },
    };
  } catch (err) {
    if (err instanceof DerivApiError) {
      throw new Error(`${err.code}: ${err.message}`);
    }
    throw err;
  }
});

export const getApp = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => appIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { readSession } = await import("./session.server");
    const { derivRequest, derivOne, DerivApiError } = await import("./deriv.server");
    const sess = readSession();
    if (!sess) throw new Error("UNAUTHENTICATED");
    try {
      const [appGet] = await derivRequest(sess.token, [{ app_get: data.appId }]);
      const app = appGet.app_get as Record<string, unknown> | undefined;
      // Try to enrich with markup details — may not be available for all apps.
      let markup: Record<string, unknown> | null = null;
      try {
        const m = await derivOne(sess.token, {
          app_markup_details: 1,
          app_id: data.appId,
          date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 19)
            .replace("T", " "),
          date_to: new Date().toISOString().slice(0, 19).replace("T", " "),
        });
        markup = (m.app_markup_details as Record<string, unknown>) ?? null;
      } catch {
        markup = null;
      }
      return {
        app: app ?? null,
        markup,
        raw: { app_get: appGet, app_markup_details: markup },
      };
    } catch (err) {
      if (err instanceof DerivApiError) {
        throw new Error(`${err.code}: ${err.message}`);
      }
      throw err;
    }
  });
