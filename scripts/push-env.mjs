// Copia las variables de .env.local a Vercel (producción) sin mostrarlas en pantalla.
import { spawnSync } from "node:child_process";

const REQUIRED = [
  "BOLSILLO_SECRET",
  "ASSEMBLYAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "PUBLIC_URL",
];
const OPTIONAL = ["TIMEZONE", "DRIVE_FOLDER_NAME"];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan en .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

for (const name of [...REQUIRED, ...OPTIONAL]) {
  if (!process.env[name]) continue;
  spawnSync("vercel", ["env", "rm", name, "production", "--yes"], { stdio: "ignore" });
  const added = spawnSync("vercel", ["env", "add", name, "production"], {
    input: process.env[name],
    stdio: ["pipe", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (added.status !== 0) {
    console.error(`No se pudo guardar ${name}: ${added.stderr}`);
    process.exit(1);
  }
  console.log(`OK ${name}`);
}
