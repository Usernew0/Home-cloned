import { withRole, MEMBERS } from "../../server/guards.js";
import { lazySupabase } from "../../server/supabaseLazy.js";
import { createHash } from "node:crypto";

const supabase = lazySupabase;

async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { chatId, text, parseMode = "HTML" } = req.body || {};
    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const chat = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

    if (!token || !chat) {
      return res.status(400).json({
        success: false,
        error: "Missing chatId or server Telegram configuration.",
      });
    }

    if (!text || typeof text !== "string") {
      return res.status(400).json({ success: false, error: "Message text is required." });
    }

    // --- Dedupe: same chat + same text within the same 10-second window = one send ---
    const bucket = Math.floor(Date.now() / 10000);
    const key = createHash("sha1").update(`${chat}|${text}|${bucket}`).digest("hex");

    const { error: dupErr } = await supabase.from("telegram_sent").insert({ key });
    if (dupErr?.code === "23505") {
      console.log("[send] duplicate blocked:", text.slice(0, 40));
      return res.status(200).json({ success: true, duplicate: true });
    }
    if (dupErr) console.error("[send dedupe]", dupErr.message); // don't block sending if the table is missing

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const result = (await response.json()) as any;

    if (!response.ok || !result.ok) {
      if (!dupErr) await supabase.from("telegram_sent").delete().eq("key", key); // allow retry
      return res.status(response.status || 400).json({
        success: false,
        error: result.description || "Telegram API returned an error",
        errorCode: result.error_code,
      });
    }

    return res.status(200).json({ success: true, messageId: result.result?.message_id });
  } catch (err: any) {
    console.error("Vercel Telegram send error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server error" });
  }
}

export default withRole(MEMBERS, handler);
