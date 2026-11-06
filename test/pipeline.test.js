import { test } from "node:test";
import assert from "node:assert/strict";
import { finishTranscript, reportFailure, startTranscription } from "../lib/pipeline.js";
import { isAuthorizedClient, isAuthorizedWebhook, isValidId, webhookToken, WEBHOOK_HEADER } from "../lib/auth.js";
import { formatStamp, markdownToHtml, renderDoc, transcriptLines } from "../lib/render.js";
import { splitTitle, summarize } from "../lib/summarize.js";

process.env.PUBLIC_URL = "https://ejemplo.test/";
process.env.BOLSILLO_SECRET = "secreto-de-prueba";

const FILE = "file_1234567890";
const TRANSCRIPT = "9ea68fd3-f953-42c1-9742-976c447fb463";

function fakeDeps(overrides = {}) {
  const calls = { docs: [], deletedFiles: [], deletedTranscripts: [] };
  const deps = {
    now: () => new Date("2026-11-06T19:32:00Z"),
    summarize: async () => ({ title: "Parches adhesivos", markdown: "## Resumen\nHablaron de parches." }),
    assembly: {
      getTranscript: async () => ({
        status: "completed",
        utterances: [{ speaker: "A", start: 65000, text: "Prueba <b>con</b> HTML" }],
      }),
      deleteTranscript: async (id) => calls.deletedTranscripts.push(id),
      ...overrides.assembly,
    },
    drive: {
      findDocByTranscript: async () => undefined,
      getFileInfo: async () => ({ createdTime: "2026-11-06T14:00:00Z" }),
      createDoc: async (doc) => {
        calls.docs.push(doc);
        return { id: "doc1", webViewLink: "https://docs.google.com/doc1" };
      },
      deleteFile: async (id) => calls.deletedFiles.push(id),
      ...overrides.drive,
    },
  };
  if (overrides.summarize) deps.summarize = overrides.summarize;
  return { deps, calls };
}

test("crea el documento y solo después borra el audio y la transcripción", async () => {
  const order = [];
  const { deps, calls } = fakeDeps({
    drive: {
      createDoc: async (doc) => {
        order.push("doc");
        calls.docs.push(doc);
        return { id: "doc1" };
      },
      deleteFile: async () => order.push("deleteFile"),
    },
    assembly: { deleteTranscript: async () => order.push("deleteTranscript") },
  });
  await finishTranscript({ transcriptId: TRANSCRIPT, fileId: FILE }, deps);
  assert.equal(order[0], "doc");
  assert.deepEqual(order.slice(1).sort(), ["deleteFile", "deleteTranscript"]);
  assert.equal(calls.docs[0].title, "2026-11-06 09:00 · Parches adhesivos");
  assert.equal(calls.docs[0].transcriptId, TRANSCRIPT);
  assert.match(calls.docs[0].html, /\[01:05\] Hablante A: Prueba &lt;b&gt;con&lt;\/b&gt; HTML/);
});

test("un webhook repetido no duplica el documento", async () => {
  const { deps, calls } = fakeDeps({
    drive: { findDocByTranscript: async () => "doc-existente" },
    summarize: async () => assert.fail("no debe resumir de nuevo"),
  });
  const result = await finishTranscript({ transcriptId: TRANSCRIPT, fileId: FILE }, deps);
  assert.equal(result.duplicate, true);
  assert.equal(calls.docs.length, 0);
  assert.deepEqual(calls.deletedFiles, [FILE]);
});

test("si el resumen falla, igual guarda la transcripción y lo avisa", async () => {
  const { deps, calls } = fakeDeps({
    summarize: async () => {
      throw new Error("Claude caído");
    },
  });
  await finishTranscript({ transcriptId: TRANSCRIPT, fileId: FILE }, deps);
  assert.match(calls.docs[0].title, /Conversación sin resumen/);
  assert.match(calls.docs[0].html, /Claude caído/);
  assert.match(calls.docs[0].html, /Hablante A/);
  assert.deepEqual(calls.deletedFiles, [FILE]);
});

test("si la transcripción falla, no borra el audio", async () => {
  const { deps, calls } = fakeDeps({
    assembly: { getTranscript: async () => ({ status: "error", error: "audio dañado" }) },
  });
  await assert.rejects(finishTranscript({ transcriptId: TRANSCRIPT, fileId: FILE }, deps), /audio dañado/);
  assert.equal(calls.docs.length, 0);
  assert.deepEqual(calls.deletedFiles, []);
});

test("si no se puede crear el documento, no borra el audio", async () => {
  const { deps, calls } = fakeDeps({
    drive: {
      createDoc: async () => {
        throw new Error("Drive caído");
      },
    },
  });
  await assert.rejects(finishTranscript({ transcriptId: TRANSCRIPT, fileId: FILE }, deps), /Drive caído/);
  assert.deepEqual(calls.deletedFiles, []);
  assert.deepEqual(calls.deletedTranscripts, []);
});

test("una limpieza fallida no se reporta como pérdida", async () => {
  const { deps, calls } = fakeDeps({
    drive: {
      deleteFile: async () => {
        throw new Error("sin permiso");
      },
    },
  });
  const result = await finishTranscript({ transcriptId: TRANSCRIPT, fileId: FILE }, deps);
  assert.equal(result.docId, "doc1");
  assert.equal(calls.docs.length, 1);
});

test("sin voz: crea la nota sin llamar a Claude", async () => {
  const { deps, calls } = fakeDeps({
    assembly: { getTranscript: async () => ({ status: "completed", text: "", utterances: [] }) },
    summarize: async () => assert.fail("no debe resumir"),
  });
  await finishTranscript({ transcriptId: TRANSCRIPT, fileId: FILE }, deps);
  assert.match(calls.docs[0].title, /Grabación sin voz/);
});

test("el reporte de error deja una nota con el archivo y no lanza", async () => {
  const { deps, calls } = fakeDeps();
  await reportFailure({ fileId: FILE, stage: "probar", error: new Error("boom") }, deps);
  assert.match(calls.docs[0].title, /Error/);
  assert.match(calls.docs[0].html, new RegExp(FILE));
  assert.match(calls.docs[0].html, /boom/);

  const failing = fakeDeps({
    drive: {
      createDoc: async () => {
        throw new Error("Drive caído");
      },
    },
  });
  await reportFailure({ fileId: FILE, stage: "probar", error: new Error("boom") }, failing.deps);
});

test("startTranscription pasa el webhook autenticado y sin la clave del iPhone", async () => {
  let submitted;
  const deps = {
    drive: { openFileStream: async () => "stream" },
    assembly: {
      uploadAudio: async (stream) => {
        assert.equal(stream, "stream");
        return "https://cdn.assemblyai.test/abc";
      },
      submitTranscript: async (args) => {
        submitted = args;
        return TRANSCRIPT;
      },
    },
  };
  await startTranscription(FILE, deps);
  assert.equal(submitted.audioUrl, "https://cdn.assemblyai.test/abc");
  assert.equal(submitted.webhookUrl, `https://ejemplo.test/api/webhook?file=${FILE}`);
  assert.equal(submitted.webhookValue, webhookToken());
  assert.notEqual(submitted.webhookValue, process.env.BOLSILLO_SECRET);
  assert.ok(!submitted.webhookUrl.includes(process.env.BOLSILLO_SECRET));
});

test("autenticación", () => {
  assert.equal(isAuthorizedClient({ headers: { authorization: "Bearer secreto-de-prueba" } }), true);
  assert.equal(isAuthorizedClient({ headers: { authorization: "Bearer otro" } }), false);
  assert.equal(isAuthorizedClient({ headers: {} }), false);
  assert.equal(isAuthorizedWebhook({ headers: { [WEBHOOK_HEADER]: webhookToken() } }), true);
  assert.equal(isAuthorizedWebhook({ headers: { [WEBHOOK_HEADER]: "secreto-de-prueba" } }), false);
  assert.equal(isValidId(FILE), true);
  assert.equal(isValidId(TRANSCRIPT), true);
  assert.equal(isValidId("x' or '1'='1"), false);
  assert.equal(isValidId(undefined), false);
});

test("render: Markdown, escape y zona horaria", () => {
  const html = markdownToHtml("## Compromisos\n- **Santi** envía <propuesta>\n- Otro\n\nFin");
  assert.equal(
    html,
    "<h3>Compromisos</h3>\n<ul>\n<li><b>Santi</b> envía &lt;propuesta&gt;</li>\n<li>Otro</li>\n</ul>\n<p>Fin</p>",
  );
  assert.equal(formatStamp(new Date("2026-11-07T02:30:00Z"), "America/Bogota"), "2026-11-06 21:30");
  assert.deepEqual(transcriptLines({ text: "solo texto" }), ["solo texto"]);
  assert.deepEqual(transcriptLines({ utterances: [{ speaker: "B", start: 3723000, text: "hola" }] }), [
    "[1:02:03] Hablante B: hola",
  ]);
  assert.match(renderDoc({ title: "<t>", stamp: "s", lines: [] }), /&lt;t&gt;.*Sin voz/s);
});

function fakeClient(message) {
  return { beta: { messages: { stream: () => ({ finalMessage: async () => message }) } } };
}

test("summarize: separa el título y maneja rechazo, vacío y truncado", async () => {
  assert.deepEqual(splitTitle("# Título\n\n## Resumen\nx"), { title: "Título", markdown: "## Resumen\nx" });
  assert.equal(splitTitle("sin título").title, "Conversación");

  const ok = await summarize("t", fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "# A\nB" }] }));
  assert.deepEqual(ok, { title: "A", markdown: "B" });

  const cut = await summarize("t", fakeClient({ stop_reason: "max_tokens", content: [{ type: "text", text: "# A\nB" }] }));
  assert.match(cut.markdown, /incompleto/);

  await assert.rejects(
    summarize("t", fakeClient({ stop_reason: "refusal", stop_details: { category: "bio" }, content: [] })),
    /rechazó.*bio/,
  );
  await assert.rejects(summarize("t", fakeClient({ stop_reason: "end_turn", content: [] })), /vacío/);
});
