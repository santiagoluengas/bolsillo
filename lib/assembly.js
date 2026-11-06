import { requireEnv } from "./auth.js";

const API = "https://api.assemblyai.com/v2";

function headers(extra = {}) {
  return { authorization: requireEnv("ASSEMBLYAI_API_KEY"), ...extra };
}

async function ensureOk(res, action) {
  if (res.ok) return res;
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  throw new Error(`AssemblyAI: ${action} falló (${res.status}) ${detail}`);
}

/** Envía el audio directo a AssemblyAI; la URL que devuelve solo la puede leer AssemblyAI. */
export async function uploadAudio(stream) {
  const res = await fetch(`${API}/upload`, {
    method: "POST",
    headers: headers({ "content-type": "application/octet-stream" }),
    body: stream,
    duplex: "half",
  });
  await ensureOk(res, "subir el audio");
  return (await res.json()).upload_url;
}

export async function submitTranscript({ audioUrl, webhookUrl, webhookHeader, webhookValue }) {
  const res = await fetch(`${API}/transcript`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      webhook_url: webhookUrl,
      webhook_auth_header_name: webhookHeader,
      webhook_auth_header_value: webhookValue,
    }),
  });
  await ensureOk(res, "pedir la transcripción");
  return (await res.json()).id;
}

export async function getTranscript(id) {
  const res = await fetch(`${API}/transcript/${encodeURIComponent(id)}`, { headers: headers() });
  await ensureOk(res, "leer la transcripción");
  return res.json();
}

export async function deleteTranscript(id) {
  const res = await fetch(`${API}/transcript/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (res.status === 404) return;
  await ensureOk(res, "borrar la transcripción");
}
