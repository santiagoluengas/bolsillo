import { waitUntil } from "@vercel/functions";
import { isAuthorizedClient, isValidId } from "../lib/auth.js";
import { reportFailure, startTranscription } from "../lib/pipeline.js";

// Responde enseguida para que el iPhone quede libre; el trabajo sigue en segundo plano.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });
  if (!isAuthorizedClient(req)) return res.status(401).json({ error: "No autorizado" });
  const fileId = req.body?.file_id;
  if (!isValidId(fileId)) return res.status(400).json({ error: "file_id inválido" });

  waitUntil(
    startTranscription(fileId).catch((error) =>
      reportFailure({ fileId, stage: "enviar el audio a transcribir", error }),
    ),
  );
  return res.status(202).json({ ok: true });
}
