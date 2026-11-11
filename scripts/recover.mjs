// Red de seguridad del atajo: envía desde el Mac las grabaciones que el iPhone no logró subir.
//
// El atajo guarda una copia del audio en iCloud Drive (carpeta de Atajos) antes de subirlo y
// la borra solo si la subida terminó. Si una copia sigue ahí después de MIN_AGE_MIN minutos,
// la subida falló: este script la manda por el mismo camino que el atajo y la
// borra definitivamente cuando el servidor ya la recibió (el audio queda en Drive/_entrantes
// hasta que exista el Doc, así que no se pierde nada).
//
// Lo corre launchd cada 30 minutos (ver scripts/install-recover.sh). Uso manual:
//   node --env-file=$HOME/.config/bolsillo/env scripts/recover.mjs
import { readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const FOLDER =
  process.env.BOLSILLO_FOLDER ||
  join(homedir(), "Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents");
const MIN_AGE_MIN = Number(process.env.BOLSILLO_MIN_AGE_MIN || 60);
const PATTERN = /^Bolsillo.*\.m4a$/i;
const { PUBLIC_URL: base, BOLSILLO_SECRET: secret } = process.env;

const log = (...args) => console.log(new Date().toISOString(), ...args);

async function call(name, url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15 * 60_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} falló (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** Lo mismo que hace el atajo: pedir URL, subir el audio a Drive y pedir el procesamiento. */
async function send(path) {
  const auth = { authorization: `Bearer ${secret}` };
  const { upload_url } = await call("start", `${base}/api/start`, { method: "POST", headers: auth });
  const { id } = await call("subida", upload_url, {
    method: "PUT",
    headers: { "content-type": "audio/mp4" },
    body: readFileSync(path),
  });
  await call("process", `${base}/api/process`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ file_id: id }),
  });
  return id;
}

if (!base || !secret) {
  log("Faltan PUBLIC_URL o BOLSILLO_SECRET");
  process.exit(1);
}
let entries;
try {
  entries = readdirSync(FOLDER);
} catch (error) {
  log(`No se puede leer la carpeta de Atajos en iCloud: ${error.message}`);
  process.exit(1);
}

// Archivos que iCloud aún no bajó a este Mac: pedir la descarga y tomarlos en la próxima vuelta.
for (const name of entries) {
  const match = name.match(/^\.(.+)\.icloud$/);
  if (match && PATTERN.test(match[1])) {
    log(`Pidiendo a iCloud que descargue ${match[1]}`);
    try {
      execFileSync("brctl", ["download", join(FOLDER, name)]);
    } catch (error) {
      log(`No se pudo pedir la descarga: ${error.message}`);
    }
  }
}

const cutoff = Date.now() - MIN_AGE_MIN * 60_000;
let failures = 0;
for (const name of entries.filter((n) => PATTERN.test(n)).sort()) {
  const path = join(FOLDER, name);
  const { mtimeMs, size } = statSync(path);
  if (mtimeMs > cutoff) continue; // Puede que el iPhone todavía la esté subiendo.
  try {
    const id = await send(path);
    unlinkSync(path);
    log(`Enviada ${name} (${(size / 1048576).toFixed(1)} MB) → Drive ${id}`);
  } catch (error) {
    failures += 1;
    log(`No se pudo enviar ${name}, se reintenta en la próxima vuelta: ${error.message}`);
  }
}
process.exit(failures ? 1 : 0);
