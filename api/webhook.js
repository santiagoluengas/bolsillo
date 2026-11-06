import { waitUntil } from "@vercel/functions";
import { isAuthorizedWebhook, isValidId } from "../lib/auth.js";
import { finishTranscript, reportFailure } from "../lib/pipeline.js";

// AssemblyAI reintenta si no recibe respuesta rápido, y el resumen tarda más.
// Por eso se responde primero y se procesa en segundo plano.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });
  if (!isAuthorizedWebhook(req)) return res.status(401).json({ error: "No autorizado" });
  const fileId = req.query?.file;
  const transcriptId = req.body?.transcript_id;
  if (!isValidId(fileId) || !isValidId(transcriptId)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  waitUntil(
    finishTranscript({ transcriptId, fileId }).catch((error) =>
      reportFailure({ fileId, stage: "procesar la transcripción", error }),
    ),
  );
  return res.status(200).json({ ok: true });
}
