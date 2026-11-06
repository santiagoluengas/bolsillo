// Autoriza a Bolsillo en tu Google Drive y guarda el refresh token en .env.local.
// Permiso "drive.file": solo puede ver y tocar los archivos que la propia app crea.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/`;
const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error("Primero pon GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.local");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/drive.file",
  access_type: "offline",
  prompt: "consent",
  state,
})}`;

async function exchange(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google rechazó el código (${res.status}): ${await res.text()}`);
  return res.json();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== "/" || url.searchParams.get("state") !== state) {
    res.writeHead(404).end();
    return;
  }
  try {
    const code = url.searchParams.get("code");
    if (!code) throw new Error(url.searchParams.get("error") ?? "Google no devolvió un código");
    const tokens = await exchange(code);
    if (!tokens.refresh_token) throw new Error("Google no devolvió refresh token");

    const about = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }).then((r) => r.json());

    const env = readFileSync(".env.local", "utf8");
    const line = `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
    writeFileSync(
      ".env.local",
      /^GOOGLE_REFRESH_TOKEN=.*$/m.test(env)
        ? env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, () => line)
        : `${env.trimEnd()}\n${line}\n`,
    );
    console.log(`Listo: Drive autorizado con ${about.user?.emailAddress ?? "cuenta desconocida"}.`);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Listo. Ya puedes cerrar esta pestaña.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(error.message);
  }
  server.close();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Abriendo Google. Entra con santiluengasg@gmail.com.\nSi no abre, usa:\n${authUrl}`);
  execFile("open", [authUrl], () => {});
});
