// Hace exactamente lo que hará el atajo del iPhone, con un archivo de audio local.
// Uso: npm run e2e -- ruta/al/audio.m4a
import { readFileSync } from "node:fs";

const [, , audioPath] = process.argv;
const { PUBLIC_URL: base, BOLSILLO_SECRET: secret } = process.env;
if (!audioPath || !base || !secret) {
  console.error("Uso: npm run e2e -- audio.m4a (con PUBLIC_URL y BOLSILLO_SECRET en .env.local)");
  process.exit(1);
}
const auth = { authorization: `Bearer ${secret}` };

async function step(name, res) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} falló (${res.status}): ${text.slice(0, 300)}`);
  console.log(`OK ${name} (${res.status})`);
  return JSON.parse(text);
}

const { upload_url } = await step("start", await fetch(`${base}/api/start`, { method: "POST", headers: auth }));
const { id } = await step(
  "subida a Drive",
  await fetch(upload_url, {
    method: "PUT",
    headers: { "content-type": "audio/mp4" },
    body: readFileSync(audioPath),
  }),
);
await step(
  "process",
  await fetch(`${base}/api/process`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ file_id: id }),
  }),
);
console.log("Enviado. El documento debería aparecer en la carpeta Bolsillo de Drive en un par de minutos.");
