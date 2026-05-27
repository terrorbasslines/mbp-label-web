import { clearSessionCookie, json, methodNotAllowed, type Env } from "../_shared";

export const onRequestPost: PagesFunction<Env> = async () =>
  json(
    { ok: true },
    {
      headers: {
        "set-cookie": clearSessionCookie()
      }
    }
  );

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["POST"]);
