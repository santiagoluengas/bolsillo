import { requireEnv } from "./auth.js";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";
const TRANSCRIPT_KEY = "bolsilloTranscript";
const INBOX_NAME = "_entrantes";

async function ensureOk(res, action) {
  if (res.ok) return res;
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  throw new Error(`Drive: ${action} falló (${res.status}) ${detail}`);
}

export async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  await ensureOk(res, "renovar el token");
  return (await res.json()).access_token;
}

async function authHeaders() {
  return { authorization: `Bearer ${await getAccessToken()}` };
}

function escapeQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(name, parentId, headers) {
  const parent = parentId ? ` and '${escapeQuery(parentId)}' in parents` : "";
  const q = `name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false${parent}`;
  const res = await fetch(`${API}/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`, { headers });
  await ensureOk(res, "buscar carpeta");
  return (await res.json()).files[0]?.id;
}

async function ensureFolder(name, parentId, headers) {
  const existing = await findFolder(name, parentId, headers);
  if (existing) return existing;
  const res = await fetch(`${API}/files?fields=id`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
  });
  await ensureOk(res, "crear carpeta");
  return (await res.json()).id;
}

async function rootFolder(headers) {
  return ensureFolder(process.env.DRIVE_FOLDER_NAME || "Bolsillo", undefined, headers);
}

/** Crea una sesión de subida. El iPhone sube el audio directo a Drive, sin pasar por Vercel. */
export async function createUploadSession({ name, mimeType = "audio/mp4" }) {
  const headers = await authHeaders();
  const inbox = await ensureFolder(INBOX_NAME, await rootFolder(headers), headers);
  const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mimeType,
    },
    body: JSON.stringify({ name, parents: [inbox] }),
  });
  await ensureOk(res, "crear sesión de subida");
  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) throw new Error("Drive no devolvió la URL de subida");
  return uploadUrl;
}

export async function getFileInfo(fileId) {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name,createdTime`, {
    headers: await authHeaders(),
  });
  await ensureOk(res, "leer el archivo");
  return res.json();
}

export async function openFileStream(fileId) {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: await authHeaders(),
  });
  await ensureOk(res, "descargar el audio");
  return res.body;
}

/** Borrar dos veces es válido: los webhooks pueden repetirse. */
export async function deleteFile(fileId) {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (res.status === 404) return;
  await ensureOk(res, "borrar el audio");
}

export async function findDocByTranscript(transcriptId) {
  const q = `appProperties has { key='${TRANSCRIPT_KEY}' and value='${escapeQuery(transcriptId)}' } and trashed = false`;
  const res = await fetch(`${API}/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`, {
    headers: await authHeaders(),
  });
  await ensureOk(res, "buscar el documento");
  return (await res.json()).files[0]?.id;
}

/** Crea un Google Doc a partir de HTML, para que quede legible y buscable en Drive. */
export async function createDoc({ title, html, transcriptId }) {
  const headers = await authHeaders();
  const metadata = {
    name: title,
    mimeType: DOC_MIME,
    parents: [await rootFolder(headers)],
    appProperties: transcriptId ? { [TRANSCRIPT_KEY]: transcriptId } : undefined,
  };
  const boundary = `bolsillo-${crypto.randomUUID()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: { ...headers, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  await ensureOk(res, "crear el documento");
  return res.json();
}
