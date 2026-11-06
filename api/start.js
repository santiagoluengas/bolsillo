import { isAuthorizedClient } from "../lib/auth.js";
import { createUploadSession } from "../lib/drive.js";
import { formatStamp } from "../lib/render.js";

// El atajo pide aquí una URL de subida. El audio va directo a Drive porque
// Vercel limita el cuerpo de las peticiones a 4,5 MB.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });
  if (!isAuthorizedClient(req)) return res.status(401).json({ error: "No autorizado" });
  try {
    const stamp = formatStamp(new Date(), process.env.TIMEZONE || "America/Bogota");
    const uploadUrl = await createUploadSession({ name: `${stamp}.m4a` });
    return res.status(200).json({ upload_url: uploadUrl });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: error.message });
  }
}
