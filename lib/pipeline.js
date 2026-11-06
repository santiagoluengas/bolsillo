import * as assembly from "./assembly.js";
import * as drive from "./drive.js";
import { summarize } from "./summarize.js";
import { formatStamp, renderDoc, transcriptLines } from "./render.js";
import { publicUrl, WEBHOOK_HEADER, webhookToken } from "./auth.js";

const defaultDeps = { assembly, drive, summarize, now: () => new Date() };
const timeZone = () => process.env.TIMEZONE || "America/Bogota";

/** Paso 1: del archivo en Drive a una transcripción en curso en AssemblyAI. */
export async function startTranscription(fileId, deps = defaultDeps) {
  const audio = await deps.drive.openFileStream(fileId);
  const audioUrl = await deps.assembly.uploadAudio(audio);
  return deps.assembly.submitTranscript({
    audioUrl,
    webhookUrl: `${publicUrl()}/api/webhook?file=${encodeURIComponent(fileId)}`,
    webhookHeader: WEBHOOK_HEADER,
    webhookValue: webhookToken(),
  });
}

async function cleanUp(fileId, transcriptId, deps) {
  // El documento ya existe: un fallo aquí no debe marcar la grabación como perdida.
  const results = await Promise.allSettled([
    deps.drive.deleteFile(fileId),
    deps.assembly.deleteTranscript(transcriptId),
  ]);
  for (const result of results) {
    if (result.status === "rejected") console.error("Limpieza incompleta:", result.reason?.message);
  }
}

/** Paso 2: con la transcripción lista, resume, crea el documento y borra el audio. */
export async function finishTranscript({ transcriptId, fileId }, deps = defaultDeps) {
  // AssemblyAI puede repetir el webhook: no duplicar el documento.
  if (await deps.drive.findDocByTranscript(transcriptId)) {
    await cleanUp(fileId, transcriptId, deps);
    return { duplicate: true };
  }

  const transcript = await deps.assembly.getTranscript(transcriptId);
  if (transcript.status === "error") {
    throw new Error(`AssemblyAI no pudo transcribir: ${transcript.error ?? "sin detalle"}`);
  }
  if (transcript.status !== "completed") {
    throw new Error(`La transcripción sigue en estado "${transcript.status}"`);
  }

  const info = await deps.drive.getFileInfo(fileId).catch(() => null);
  const stamp = formatStamp(info?.createdTime ? new Date(info.createdTime) : deps.now(), timeZone());
  const lines = transcriptLines(transcript);

  let title = "Grabación sin voz";
  let summaryMarkdown = "";
  let notice;
  if (lines.length) {
    // Si el resumen falla, la transcripción igual se guarda: es lo que no se puede recuperar.
    try {
      ({ title, markdown: summaryMarkdown } = await deps.summarize(lines.join("\n")));
    } catch (error) {
      console.error("Resumen fallido:", error.message);
      title = "Conversación sin resumen";
      notice = `No se pudo generar el resumen: ${error.message}`;
    }
  }

  const doc = await deps.drive.createDoc({
    title: `${stamp} · ${title}`,
    transcriptId,
    html: renderDoc({ title, stamp, summaryMarkdown, notice, lines }),
  });
  await cleanUp(fileId, transcriptId, deps);
  return { docId: doc.id, url: doc.webViewLink };
}

/** Deja el error visible en Drive. El audio se conserva en _entrantes para reintentar. */
export async function reportFailure({ fileId, stage, error }, deps = defaultDeps) {
  console.error(`Fallo en ${stage} (${fileId}):`, error?.message);
  const stamp = formatStamp(deps.now(), timeZone());
  const title = `⚠️ ${stamp} · Error procesando una grabación`;
  try {
    await deps.drive.createDoc({
      title,
      html: renderDoc({
        title: "Error procesando una grabación",
        stamp,
        notice: `Falló: ${stage}. ${error?.message ?? ""}`,
        lines: [
          `El audio sigue en la carpeta _entrantes (archivo ${fileId}).`,
          `Para reintentar: POST /api/process con {"file_id":"${fileId}"}. Si ya no hace falta, borra esta nota y ese audio.`,
        ],
      }),
    });
  } catch (reportError) {
    console.error("Tampoco se pudo crear la nota de error:", reportError.message);
  }
}
