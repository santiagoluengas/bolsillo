export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_(.+?)_(?=$|[\s).,;:])/g, "$1<i>$2</i>");
}

/** Markdown mínimo: lo único que produce el resumen (títulos, viñetas, párrafos, negrita, cursiva). */
export function markdownToHtml(markdown) {
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) out.push("</ul>");
    inList = false;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,4})\s+(.+)/);
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      if (!inList) out.push("<ul>");
      inList = true;
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (line) {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

function clock(ms) {
  const total = Math.floor((ms ?? 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Texto con hablante y minuto. Es lo que lee Claude y lo que queda en el documento. */
export function transcriptLines(transcript) {
  if (transcript.utterances?.length) {
    return transcript.utterances.map((u) => `[${clock(u.start)}] Hablante ${u.speaker}: ${u.text}`);
  }
  return transcript.text ? [transcript.text] : [];
}

export function formatStamp(date, timeZone = "America/Bogota") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function renderDoc({ title, stamp, summaryMarkdown, notice, lines }) {
  const sections = [`<h1>${escapeHtml(title)}</h1>`, `<p><i>Grabado: ${escapeHtml(stamp)}</i></p>`];
  if (notice) sections.push(`<p><b>${escapeHtml(notice)}</b></p>`);
  if (summaryMarkdown) sections.push(markdownToHtml(summaryMarkdown));
  sections.push("<h2>Transcripción</h2>");
  sections.push(lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n") || "<p>(Sin voz detectada.)</p>");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${sections.join("\n")}</body></html>`;
}
