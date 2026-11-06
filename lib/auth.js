import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_HEADER = "x-bolsillo-webhook";

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

/** El atajo del iPhone se autentica con `Authorization: Bearer <BOLSILLO_SECRET>`. */
export function isAuthorizedClient(req, secret = requireEnv("BOLSILLO_SECRET")) {
  return safeEqual(req.headers.authorization ?? "", `Bearer ${secret}`);
}

/** Valor derivado, para que AssemblyAI nunca vea la clave que usa el iPhone. */
export function webhookToken(secret = requireEnv("BOLSILLO_SECRET")) {
  return createHmac("sha256", secret).update("assemblyai-webhook").digest("hex");
}

export function isAuthorizedWebhook(req, secret = requireEnv("BOLSILLO_SECRET")) {
  return safeEqual(req.headers[WEBHOOK_HEADER] ?? "", webhookToken(secret));
}

export function isValidId(id) {
  return typeof id === "string" && /^[\w-]{10,200}$/.test(id);
}

export function publicUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  throw new Error("Falta la variable de entorno PUBLIC_URL");
}
