// Crea .env.local con una clave aleatoria. No sobrescribe un archivo existente.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env.local")) {
  console.log(".env.local ya existe; no lo toco.");
} else {
  const secret = randomBytes(32).toString("base64url");
  const content = readFileSync(".env.example", "utf8").replace("BOLSILLO_SECRET=", `BOLSILLO_SECRET=${secret}`);
  writeFileSync(".env.local", content, { mode: 0o600 });
  console.log("Listo: .env.local creado. Completa las claves que faltan.");
}
