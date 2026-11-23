import { isProductionRuntime, verifySecret } from "../../server/auth.js";
import { lazySupabase } from "../../server/supabaseLazy.js";

// ---------------------------------------------------------------------------
// Supabase client (server side)
// Prefers a non-VITE service role key; falls back to the VITE_ variables.
// ---------------------------------------------------------------------------
const supabase = lazySupabase;

// ---------------------------------------------------------------------------
// Firestore via REST (no service account, no extra npm package)
// Reads the web config straight from firebase-applet-config.json in the repo.
// Works only if your firestore.rules allow reading the chat collection.
// ---------------------------------------------------------------------------
type FbCfg = { projectId: string; apiKey: string; databaseId: string } | null;
let fbCfgCache: FbCfg | undefined;

async function loadFirebaseConfig(): Promise<FbCfg> {
  if (fbCfgCache !== undefined) return fbCfgCache;

  let raw: any = null;

  // 1) Import the JSON file from the repo root (bundled by Vercel)
  try {
    // @ts-ignore - JSON import path relative to api/telegram/
    const mod: any = await import("../../firebase-applet-config.json");
    raw = mod?.default ?? mod;
  } catch (_) {
    /* fall through */
  }

  // 2) Read it from disk
  if (!raw) {
    try {
      // @ts-ignore
      const fs: any = await import("node:fs");
      // @ts-ignore
      const path: any = await import("node:path");
      raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
    } catch (_) {
      /* fall through */
    }
  }

  // 3) Optional env var fallback
  const projectId = raw?.projectId || process.env.FIREBASE_PROJECT_ID || "";
  const apiKey = raw?.apiKey || process.env.FIREBASE_API_KEY || "";
  const databaseId = raw?.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID || "(default)";

  fbCfgCache = projectId && apiKey ? { projectId, apiKey, databaseId } : null;
  return fbCfgCache;
}

// Convert Firestore REST typed values into plain JS values
const fsValue = (v: any): any => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue).getTime();
  if ("mapValue" in v) return fsFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsValue);
  return null;
};
const fsFields = (f: any): any => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fsValue(v)]));

async function fsPost(cfg: NonNullable<FbCfg>, path: string, body: any) {
  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${encodeURIComponent(cfg.databaseId)}/documents`;
  const r = await fetch(`${base}${path}?key=${cfg.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await r.json();
  if (!r.ok) {
    const err = Array.isArray(j) ? j[0]?.error : j?.error;
    throw new Error(err?.message || `HTTP ${r.status}`);
  }
  return j;
}

// Run a structured query and return plain objects
async function fsQuery(cfg: NonNullable<FbCfg>, structuredQuery: any): Promise<any[]> {
  const j = await fsPost(cfg, ":runQuery", { structuredQuery });
  return (Array.isArray(j) ? j : []).filter((x: any) => x.document).map((x: any) => fsFields(x.document.fields || {}));
}

// Collection and field names (override with env vars if yours differ)
const CHAT_COLLECTION = process.env.FIRESTORE_CHAT_COLLECTION || "chatMessages";
const CHAT_TZ = process.env.BOT_TIMEZONE || "Africa/Cairo";
const CHAT_TIME_FIELDS = ["createdAt", "timestamp", "time", "date", "sentAt"];

const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis(); // Firestore Timestamp
  if (typeof v._seconds === "number") return v._seconds * 1000;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
};

const msgTime = (d: any): number => {
  for (const f of CHAT_TIME_FIELDS) {
    const ms = toMillis(d[f]);
    if (ms) return ms;
  }
  return 0;
};

const msgSender = (d: any): string => String(d.senderName ?? d.sender ?? d.from ?? d.username ?? d.user ?? d.author ?? "Someone");

const msgText = (d: any): string => {
  const t = d.text ?? d.content ?? d.message ?? d.body;
  if (t) return String(t);
  if (d.imageUrl || d.image || d.photo || d.mediaUrl) return "📷 Photo";
  if (d.audioUrl || d.voice) return "🎤 Voice message";
  return "…";
};

const NOT_LINKED = `🔗 <b>Account not linked</b>\n\nSend /id first. If that doesn't work, ask the admin to link your Chat ID.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getLinkedUser(chatId: string) {
  const { data, error } = await supabase.from("user_accounts").select("id, username, display_name, couple_id").eq("telegram_chat_id", chatId).maybeSingle();
  if (error) console.error("[getLinkedUser]", error.message);
  return data;
}

const daysUntil = (d: string) => {
  const t = new Date(d).getTime();
  return isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
};

const countdownText = (d: string) => {
  const n = daysUntil(d);
  if (n === null) return "";
  if (n === 0) return " (today 🎉)";
  return n > 0 ? ` (in ${n} days)` : ` (${-n} days ago)`;
};

// Parse a date string to ms, or null if it can't be parsed
const parseMs = (d: any): number | null => {
  const t = new Date(String(d)).getTime();
  return isNaN(t) ? null : t;
};

// All the ways this user might be named in the data
const identities = (u: any): string[] => [u.username, u.display_name, u.id].filter(Boolean).map((s: any) => String(s).toLowerCase().trim());

const matchesUser = (value: any, ids: string[]) => {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();
  return !!v && ids.some((i) => v === i || v.includes(i) || i.includes(v));
};

const norm = (s: any) =>
  String(s || "")
    .toLowerCase()
    .replace(/^@/, "")
    .trim();

// ---------------------------------------------------------------------------
// Auto-link a Telegram chat to an Our Home account (saves chat ID in Supabase)
// Links only when exactly ONE unlinked account matches.
// ---------------------------------------------------------------------------
async function autoLink(chatId: string, rawUser: string, firstName: string, lastName: string) {
  // Already linked?
  const { data: existing } = await supabase.from("user_accounts").select("username").eq("telegram_chat_id", chatId).maybeSingle();
  if (existing) return existing.username as string;

  const { data: accounts, error } = await supabase.from("user_accounts").select("id, username, display_name, telegram_username, telegram_chat_id");
  if (error) {
    console.error("[autoLink list]", error.message);
    return null;
  }

  const free = (accounts || []).filter((a) => !a.telegram_chat_id);
  const handle = norm(rawUser);
  const first = norm(firstName);
  const full = norm(`${firstName} ${lastName}`);

  const pick = (fn: (a: any) => boolean) => {
    const m = free.filter(fn);
    return m.length === 1 ? m[0] : null;
  };

  const match = (handle && pick((a) => norm(a.telegram_username) === handle)) || (handle && pick((a) => norm(a.username) === handle || norm(a.display_name) === handle)) || (first && pick((a) => [norm(a.display_name), norm(a.username)].includes(first) || norm(a.display_name) === full));

  if (!match) return null;

  // Don't overwrite a saved Telegram username with null
  const { error: upErr } = await supabase
    .from("user_accounts")
    .update(handle ? { telegram_chat_id: chatId, telegram_username: `@${handle}` } : { telegram_chat_id: chatId })
    .eq("id", match.id);
  if (upErr) {
    console.error("[autoLink update]", upErr.message);
    return null;
  }

  return match.username as string;
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  // Optional: verify the request really comes from Telegram
  // Fail closed: the webhook secret is mandatory in production.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!verifySecret(req.headers["x-telegram-bot-api-secret-token"], secret, isProductionRuntime())) {
    return res.status(401).json({ ok: false });
  }

  try {
    const update = req.body;
    const message = update?.message || update?.edited_message;

    if (!message || !message.chat) {
      return res.status(200).json({
        ok: true,
        note: "No message payload",
      });
    }

    // User information
    const chatId = String(message.chat.id);
    const fromUser = message.from || {};

    const rawUser = fromUser.username || message.chat.username || "";
    const tgUsername = rawUser ? `@${rawUser}` : "";

    const firstName = fromUser.first_name || message.chat.first_name || "Lover";

    const text = (message.text || "").trim();
    const lowerText = text.toLowerCase();

    // Escape HTML to prevent malformed Telegram HTML messages
    const escapeHtml = (value: string) =>
      String(value).replace(/[&<>"']/g, (char) => {
        const entities: Record<string, string> = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        };
        return entities[char];
      });

    const safeName = escapeHtml(firstName);
    const safeUsername = escapeHtml(tgUsername);

    // Normalize commands:
    // Supports /messages, /messages@ourhomecouplebot
    // Also supports bare words such as messages
    const firstWord = lowerText.split(/\s+/)[0] || "";

    const command = firstWord.startsWith("/") ? firstWord.split("@")[0] : firstWord;

    const isAccessConfirmation = ["start", "confirm", "access", "verify"].includes(command.replace("/", "")) || lowerText === "ok" || lowerText === "yes";

    // All supported bot commands and aliases
    const commandAliases: Record<string, string> = {
      "/start": "start",
      start: "start",

      "/confirm": "confirm",
      confirm: "confirm",

      "/access": "access",
      access: "access",

      "/verify": "verify",
      verify: "verify",

      "/milestones": "milestones",
      milestones: "milestones",
      "/countdown": "countdown",
      countdown: "countdown",

      "/dates": "dates",
      dates: "dates",
      "/datenight": "dates",
      datenight: "dates",

      "/letters": "letters",
      letters: "letters",
      "/loveletters": "letters",
      loveletters: "letters",

      "/chat": "chat",
      chat: "chat",
      "/messages": "chat",
      messages: "chat",

      "/security": "security",
      security: "security",
      "/shield": "security",
      shield: "security",

      "/cards": "cards",
      cards: "cards",
      "/moments": "cards",
      moments: "cards",

      "/status": "status",
      status: "status",

      "/help": "help",
      help: "help",

      "/id": "id",
      id: "id",
      "/chatid": "id",
      chatid: "id",
    };

    const resolvedCommand = commandAliases[command];

    const isRecognizedCommand = Boolean(resolvedCommand || lowerText === "ok" || lowerText === "yes");

    console.log(`[Vercel Telegram Webhook] Message from ${tgUsername || firstName} (${chatId}): "${text}" ` + `(isRecognizedCommand=${isRecognizedCommand}, ` + `isAccessConfirmation=${isAccessConfirmation}, ` + `command=${resolvedCommand || "none"})`);

    // Telegram bot token (environment variable preferred)
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (token) {
      let replyText = "";

      const displayName = safeUsername ? ` (<code>${safeUsername}</code>)` : "";

      // 3. Access confirmation (/start, /confirm, ...) -> auto-link in Supabase
      if (isAccessConfirmation) {
        const linkedName = await autoLink(chatId, rawUser, firstName, fromUser.last_name || "");

        replyText = linkedName
          ? `✅ <b>Access Confirmed &amp; Verified!</b> 🎉\n\n` + `Hello <b>${safeName}</b>${displayName}!\n\n` + `Your Telegram is linked to <b>${escapeHtml(String(linkedName))}</b> in Our Home.\n` + `• <b>Chat ID:</b> <code>${chatId}</code>\n` + `• <b>Status:</b> Active Recipient 🟢\n\n` + `Try /milestones, /dates or /letters. 💕`
          : `⚠️ <b>I couldn't match you to an Our Home account</b>\n\n` + `• <b>Chat ID:</b> <code>${chatId}</code>\n\n` + `Ask the admin to link this Chat ID to your account.`;
      }

      // 4. Chat ID (also tries to auto-link)
      else if (resolvedCommand === "id") {
        const linkedName = await autoLink(chatId, rawUser, firstName, fromUser.last_name || "");

        replyText = `🆔 <b>Your Telegram Credentials:</b>\n\n` + `• <b>Chat ID:</b> <code>${chatId}</code>\n` + (safeUsername ? `• <b>Username:</b> <code>${safeUsername}</code>\n` : "") + `• <b>Our Home account:</b> ${linkedName ? `✅ ${escapeHtml(String(linkedName))}` : "❌ not linked"}\n\n` + (linkedName ? `You're all set. Try /milestones. 💕` : `Send /confirm to try again, or ask the admin to link you.`);
      }

      // 5. Connection status
      else if (resolvedCommand === "status") {
        const user = await getLinkedUser(chatId);
        replyText = `📊 <b>Our Home Connection Status</b>\n\n` + `• <b>Name:</b> ${safeName}\n` + (safeUsername ? `• <b>Telegram:</b> <code>${safeUsername}</code>\n` : "") + `• <b>Chat ID:</b> <code>${chatId}</code>\n` + `• <b>Account:</b> ${user ? `✅ ${escapeHtml(String(user.username))}` : "❌ not linked"}\n` + `• <b>Webhook:</b> Receiving messages 🟢\n` + `• <b>Bot:</b> Online 🟢\n\n` + `Use /help to explore available commands.`;
      }

      // 6. Help command
      else if (resolvedCommand === "help") {
        replyText =
          `🤖 <b>Our Home Telegram Bot Commands</b>\n\n` +
          `🔐 <b>Account</b>\n` +
          `/confirm - Confirm access\n` +
          `/id - Display your Chat ID\n` +
          `/status - Check bot connection\n\n` +
          `💍 <b>Website Sections</b>\n` +
          `/milestones - Milestones &amp; Anniversaries\n` +
          `/dates - Date Night Reminders\n` +
          `/letters - Sealed Love Letters\n` +
          `/chat - Sweet Chat Messages\n` +
          `/security - Security &amp; Login Alerts\n` +
          `/cards - Moment &amp; Celebration Cards\n\n` +
          `ℹ️ <b>Other</b>\n` +
          `/help - Show this command guide\n\n` +
          `💕 <i>Our Home — Made with Love.</i>`;
      }

      // 7. Section-specific commands (real data for the user who sent it)
      else if (resolvedCommand === "milestones") {
        const user = await getLinkedUser(chatId);
        if (!user) {
          replyText = NOT_LINKED;
        } else {
          const { data: rows, error } = await supabase
            .from("milestones")
            .select("title, date")
            .eq("couple_id", user.couple_id || "couple_default")
            .eq("archived", false)
            .order("date", { ascending: true })
            .limit(15);
          if (error) console.error("[milestones]", error.message);

          replyText = error ? `💍 <b>Milestones &amp; Anniversaries</b>\n\n⚠️ Couldn't load your milestones right now. Please try again.` : `💍 <b>Milestones &amp; Anniversaries</b>\n\n` + (rows?.length ? rows.map((r) => `• <b>${escapeHtml(String(r.title))}</b> — ${escapeHtml(String(r.date))}${countdownText(r.date)}`).join("\n") : `No milestones yet. Add one in Our Home! 💕`);
        }
      } else if (resolvedCommand === "countdown") {
        const user = await getLinkedUser(chatId);
        if (!user) {
          replyText = NOT_LINKED;
        } else {
          const coupleId = user.couple_id || "couple_default";
          const { data: rows, error } = await supabase.from("milestones").select("*").eq("couple_id", coupleId).eq("archived", false).order("date", { ascending: true }).limit(50);

          const { data: adminRow } = await supabase.from("admin_settings").select("*").eq("id", "countdownConfig").maybeSingle();

          const cConfig = adminRow?.countdownConfig || adminRow?.config || {};
          const isCustom = cConfig?.mode === "custom" && !!cConfig.customDate;

          const parseEventDateInEgypt = (dateStr: string): Date => {
            if (!dateStr) return new Date();
            if (dateStr.includes("Z") || /[-+]\d{2}:\d{2}$/.test(dateStr)) {
              return new Date(dateStr);
            }
            let year = 2026,
              month = 0,
              day = 1,
              hours = 0,
              minutes = 0,
              seconds = 0;
            const hasT = dateStr.includes("T");
            const datePart = hasT ? dateStr.split("T")[0] : dateStr;
            const timePart = hasT ? dateStr.split("T")[1] : "";
            const dateParts = datePart.split("-");
            if (dateParts.length === 3) {
              year = parseInt(dateParts[0], 10);
              month = parseInt(dateParts[1], 10) - 1;
              day = parseInt(dateParts[2], 10);
            } else {
              const d = new Date(dateStr);
              return isNaN(d.getTime()) ? new Date() : d;
            }
            if (timePart) {
              const timeParts = timePart.split(":");
              if (timeParts.length >= 2) {
                hours = parseInt(timeParts[0], 10);
                minutes = parseInt(timeParts[1], 10);
                if (timeParts.length >= 3) seconds = parseInt(timeParts[2], 10);
              }
            }
            try {
              const testDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
              const formatter = new Intl.DateTimeFormat("en-US", {
                timeZone: "Africa/Cairo",
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
                second: "numeric",
                hour12: false,
              });
              const parts = formatter.formatToParts(testDate);
              const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
              const fYear = getPart("year");
              const fMonth = getPart("month") - 1;
              const fDay = getPart("day");
              const fHour = getPart("hour") === 24 ? 0 : getPart("hour");
              const fMin = getPart("minute");
              const fSec = getPart("second");
              const formattedDateUTC = Date.UTC(fYear, fMonth, fDay, fHour, fMin, fSec);
              const offsetMs = testDate.getTime() - formattedDateUTC;
              const targetUTC = Date.UTC(year, month, day, hours, minutes, seconds);
              return new Date(targetUTC + offsetMs);
            } catch (e) {
              return new Date(dateStr);
            }
          };

          const getEgyptNow = (): Date => {
            try {
              const now = new Date();
              const formatter = new Intl.DateTimeFormat("en-US", {
                timeZone: "Africa/Cairo",
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
                second: "numeric",
                hour12: false,
              });
              const parts = formatter.formatToParts(now);
              const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
              const y = getPart("year");
              const m = getPart("month") - 1;
              const d = getPart("day");
              const h = getPart("hour") === 24 ? 0 : getPart("hour");
              const min = getPart("minute");
              const s = getPart("second");
              return new Date(Date.UTC(y, m, d, h, min, s));
            } catch (e) {
              return new Date();
            }
          };

          const getEgyptCalendarComponents = (date: Date): { year: number; month: number; day: number; hour: number; minute: number } => {
            try {
              const formatter = new Intl.DateTimeFormat("en-US", {
                timeZone: "Africa/Cairo",
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
                second: "numeric",
                hour12: false,
              });
              const parts = formatter.formatToParts(date);
              const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
              return {
                year: getPart("year"),
                month: getPart("month") - 1,
                day: getPart("day"),
                hour: getPart("hour") === 24 ? 0 : getPart("hour"),
                minute: getPart("minute"),
              };
            } catch (e) {
              return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
            }
          };

          const getNextOccurrenceInfo = (dateStr: string) => {
            if (!dateStr) return { targetMs: Infinity, targetDateStr: dateStr, diffMs: 0 };
            const hasT = dateStr.includes("T");
            const datePart = hasT ? dateStr.split("T")[0] : dateStr;
            const timePart = hasT ? dateStr.split("T")[1] : "";
            const dateParts = datePart.split("-");
            if (dateParts.length !== 3) {
              const t = new Date(dateStr).getTime();
              return { targetMs: isNaN(t) ? Infinity : t, targetDateStr: dateStr, diffMs: Math.max(0, t - Date.now()) };
            }
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            let hours = 0;
            let minutes = 0;
            if (timePart) {
              const tp = timePart.split(":");
              if (tp.length >= 2) {
                hours = parseInt(tp[0], 10);
                minutes = parseInt(tp[1], 10);
              }
            }

            const now = new Date();
            const egyptComp = getEgyptCalendarComponents(now);
            let targetYear = egyptComp.year;

            const targetStrThisYear = `${targetYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
            let targetDate = parseEventDateInEgypt(targetStrThisYear);

            if (targetDate.getTime() <= now.getTime()) {
              targetYear += 1;
              const targetStrNextYear = `${targetYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
              targetDate = parseEventDateInEgypt(targetStrNextYear);
            }

            const targetMs = targetDate.getTime();
            const diffMs = targetMs - now.getTime();
            const targetDateStr = `${targetYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` + (hasT ? `T${timePart}` : "");

            return {
              targetMs,
              targetDateStr,
              diffMs: Math.max(0, diffMs),
            };
          };

          let targetMilestone: any = null;
          let targetInfo: any = null;

          if (isCustom) {
            targetInfo = getNextOccurrenceInfo(cConfig.customDate);
            targetMilestone = {
              title: cConfig.customTitle || "Our Special Day",
              date: targetInfo.targetDateStr,
              category: cConfig.customCategory || "anniversary",
              description: cConfig.customCelebrationMessage || "Special Day Countdown",
              sweetMessage: cConfig.customCelebrationMessage || "",
              isCustom: true,
            };
          } else {
            const allowed = cConfig?.allowedCategories && cConfig.allowedCategories.length > 0 ? cConfig.allowedCategories : ["anniversary", "engagement", "birthday", "other"];
            const eligible = (rows || []).filter((m) => allowed.includes(m.category));
            let found: any = null;
            if (cConfig?.featuredMilestoneId) {
              found = eligible.find((m) => m.id === cConfig.featuredMilestoneId);
            }
            if (!found && eligible.length > 0) {
              const sorted = [...eligible].sort((a, b) => getNextOccurrenceInfo(a.date).targetMs - getNextOccurrenceInfo(b.date).targetMs);
              found = sorted[0];
            }
            if (!found && rows && rows.length > 0) {
              const sortedAll = [...rows].sort((a, b) => getNextOccurrenceInfo(a.date).targetMs - getNextOccurrenceInfo(b.date).targetMs);
              found = sortedAll[0];
            }

            if (found) {
              targetInfo = getNextOccurrenceInfo(found.date);
              targetMilestone = {
                ...found,
                date: targetInfo.targetDateStr,
              };
            }
          }

          if (error) {
            replyText = `⏳ <b>Relationship Countdown</b>\n\n⚠️ Couldn't load countdown right now. Please try again.`;
          } else if (!targetMilestone || !targetInfo) {
            replyText = `⏳ <b>Relationship Countdown</b>\n\nNo active milestones or countdown events configured yet. Add one in Our Home! 💕`;
          } else {
            const diffMs = targetInfo.diffMs;
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

            const isToday = diffMs <= 0 || (days === 0 && hours === 0 && minutes === 0);
            const badge = isToday ? "🎉 <b>Today is the Big Day!</b>" : `⏳ <b>${days} days, ${hours} hours, ${minutes} minutes remaining</b>`;

            const catEmoji = targetMilestone.category === "anniversary" ? "💍" : targetMilestone.category === "engagement" ? "💎" : targetMilestone.category === "birthday" ? "🎂" : "✨";

            replyText = `⏱️ <b>Active Relationship Countdown</b>\n\n` + `${catEmoji} <b>${escapeHtml(String(targetMilestone.title))}</b>\n` + `• <b>Category:</b> ${escapeHtml(String(targetMilestone.category))}\n` + `• <b>Target Date:</b> ${escapeHtml(String(targetMilestone.date))}\n` + `• <b>Time Left:</b> ${badge}\n` + (targetMilestone.sweetMessage ? `\n💬 <i>"${escapeHtml(String(targetMilestone.sweetMessage))}"</i>` : "") + `\n\n💕 <i>Our Home — Made with Love.</i>`;
          }
        }
      } else if (resolvedCommand === "dates") {
        const user = await getLinkedUser(chatId);
        if (!user) {
          replyText = NOT_LINKED;
        } else {
          const { data: rows, error } = await supabase
            .from("date_plans")
            .select("title, date_time, location, status")
            .eq("couple_id", user.couple_id || "couple_default")
            .limit(200);
          if (error) console.error("[dates]", error.message);

          const today = new Date().setHours(0, 0, 0, 0);
          const plans = (rows || []).filter((r) => !["cancelled", "canceled"].includes(String(r.status || "").toLowerCase())).map((r) => ({ ...r, ms: parseMs(r.date_time) }));

          const upcoming = plans
            .filter((p) => String(p.status).toLowerCase() !== "completed" && (p.ms === null || p.ms >= today))
            .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity))
            .slice(0, 10);

          const past = plans
            .filter((p) => p.ms !== null && p.ms < today)
            .sort((a, b) => (b.ms as number) - (a.ms as number))
            .slice(0, 3);

          const line = (p: any) => `• <b>${escapeHtml(String(p.title))}</b> — ${escapeHtml(String(p.date_time))}${countdownText(p.date_time)}` + (p.location ? `\n   📍 ${escapeHtml(String(p.location))}` : "");

          if (error) {
            replyText = `🗓️ <b>Date Night Reminders</b>\n\n⚠️ Couldn't load your dates right now. Please try again.`;
          } else if (upcoming.length) {
            replyText = `🗓️ <b>Date Night Reminders</b>\n\n${upcoming.map(line).join("\n")}`;
          } else if (past.length) {
            replyText = `🗓️ <b>Date Night Reminders</b>\n\nNothing upcoming. Your latest dates:\n\n${past.map(line).join("\n")}\n\n💕 Plan the next one in Our Home!`;
          } else {
            replyText = `🗓️ <b>Date Night Reminders</b>\n\nNo dates planned yet. 💕`;
          }
        }
      } else if (resolvedCommand === "letters") {
        const user = await getLinkedUser(chatId);
        if (!user) {
          replyText = NOT_LINKED;
        } else {
          const ids = identities(user);
          const { data: rows, error } = await supabase
            .from("letters")
            .select("sender, recipient, subject, is_opened, date")
            .eq("couple_id", user.couple_id || "couple_default")
            .order("created_at", { ascending: false })
            .limit(100);
          if (error) console.error("[letters]", error.message);

          const all = rows || [];
          const inbox = all
            .filter((r) => matchesUser(r.recipient, ids))
            .sort((a, b) => Number(a.is_opened) - Number(b.is_opened)) // unread first
            .slice(0, 8);
          const sent = all.filter((r) => matchesUser(r.sender, ids)).slice(0, 5);

          let body = "";
          if (inbox.length) {
            body += `📥 <b>For you</b>\n` + inbox.map((r) => `${r.is_opened ? "📖" : "💌 <b>New</b>"} ${escapeHtml(String(r.subject))} — from ${escapeHtml(String(r.sender))} (${escapeHtml(String(r.date))})`).join("\n") + "\n\n";
          }
          if (sent.length) {
            body += `📤 <b>You sent</b>\n` + sent.map((r) => `${r.is_opened ? "✅ opened" : "⏳ not opened yet"} — ${escapeHtml(String(r.subject))} to ${escapeHtml(String(r.recipient))}`).join("\n") + "\n\n";
          }
          // Fallback if names didn't match at all
          if (!body && all.length) {
            body =
              `💌 <b>Latest letters</b>\n` +
              all
                .slice(0, 8)
                .map((r) => `${r.is_opened ? "📖" : "💌"} ${escapeHtml(String(r.subject))} — ${escapeHtml(String(r.sender))} → ${escapeHtml(String(r.recipient))}`)
                .join("\n") +
              "\n\n";
          }

          replyText = error ? `💌 <b>Sealed Love Letters</b>\n\n⚠️ Couldn't load your letters right now. Please try again.` : `💌 <b>Sealed Love Letters</b>\n\n` + (body.trim() || `No letters yet. 💕`);
        }
      } else if (resolvedCommand === "chat") {
        const user = await getLinkedUser(chatId);
        const head = `💬 <b>Sweet Chat Messages</b>\n\n`;
        const fb = user ? await loadFirebaseConfig() : null;

        if (!user) {
          replyText = NOT_LINKED;
        } else if (!fb) {
          replyText = head + `⚠️ Couldn't read <code>firebase-applet-config.json</code>. Make sure it is in the repo root and has projectId and apiKey.`;
        } else {
          try {
            const arg = (text.split(/\s+/)[1] || "").toLowerCase();

            // /chat debug  -> shows real collection and field names
            if (arg === "debug") {
              let names: string[] = [];
              try {
                const lc = await fsPost(fb, ":listCollectionIds", {});
                names = lc.collectionIds || [];
              } catch (e: any) {
                names = [`(cannot list: ${e.message})`];
              }

              let sample = "";
              try {
                const one = await fsQuery(fb, { from: [{ collectionId: CHAT_COLLECTION }], limit: 1 });
                sample = one.length ? Object.keys(one[0]).join(", ") : "no documents found";
              } catch (e: any) {
                sample = `error: ${e.message}`;
              }

              replyText = head + `<b>Project:</b> <code>${escapeHtml(fb.projectId)}</code>\n` + `<b>Database:</b> <code>${escapeHtml(fb.databaseId)}</code>\n` + `<b>Collections:</b> <code>${escapeHtml(names.join(", ") || "none")}</code>\n` + `<b>Using:</b> <code>${escapeHtml(CHAT_COLLECTION)}</code>\n` + `<b>Fields:</b> <code>${escapeHtml(sample)}</code>`;
            } else {
              // Newest messages first. Single-field orderBy needs no composite index.
              let docs: any[] = [];
              for (const f of CHAT_TIME_FIELDS) {
                try {
                  docs = await fsQuery(fb, {
                    from: [{ collectionId: CHAT_COLLECTION }],
                    orderBy: [{ field: { fieldPath: f }, direction: "DESCENDING" }],
                    limit: 30,
                  });
                  if (docs.length) break;
                } catch (_) {
                  /* try next field */
                }
              }
              if (!docs.length) {
                docs = await fsQuery(fb, { from: [{ collectionId: CHAT_COLLECTION }], limit: 200 });
              }

              // Only this couple's messages, when the documents carry a couple id
              const mine = docs.filter((d) => {
                const cid = d.coupleId ?? d.couple_id;
                return !cid || String(cid) === String(user.couple_id || "couple_default");
              });

              const seen = new Set<string>();
              const last = mine
                .sort((a, b) => msgTime(b) - msgTime(a))
                .filter((m) => {
                  // same sender + same text within 5 seconds = duplicate
                  const key = `${msgSender(m)}|${msgText(m)}|${Math.floor(msgTime(m) / 5000)}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                })
                .slice(0, 5)
                .reverse();

              replyText =
                head +
                (last.length
                  ? last
                      .map((m) => {
                        const ms = msgTime(m);
                        const when = ms
                          ? new Date(ms).toLocaleString("en-GB", {
                              timeZone: CHAT_TZ,
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "";
                        return `<b>${escapeHtml(msgSender(m))}</b>${when ? ` <i>(${escapeHtml(when)})</i>` : ""}:\n` + `${escapeHtml(msgText(m).slice(0, 150))}`;
                      })
                      .join("\n\n")
                  : `No messages yet. 💕`);
            }
          } catch (e: any) {
            console.error("[chat]", e?.message);
            replyText = head + `⚠️ Couldn't load messages right now. Please try again.`;
          }
        }
      } else if (resolvedCommand === "security") {
        const head = `🛡️ <b>Security &amp; Login Alerts</b>\n`;

        // 1) AUTH: the Telegram chat must be linked to exactly one account
        const { data: acct, error: authErr } = await supabase.from("user_accounts").select("id, username, display_name, couple_id, telegram_chat_id").eq("telegram_chat_id", chatId).maybeSingle();

        if (authErr) console.error("[security auth]", authErr.message);

        if (!acct || String(acct.telegram_chat_id) !== chatId) {
          replyText = NOT_LINKED;
        } else {
          const coupleId = String(acct.couple_id || "couple_default");

          // Only names that belong to THIS account (exact match, case-insensitive)
          const mineNames = new Set([acct.username, acct.display_name, acct.id].filter(Boolean).map((v) => String(v).toLowerCase().trim()));

          // 2) FETCH: newest rows, no fragile DB filters (this is what worked before)
          const { data: all, error } = await supabase.from("activity_logs").select("username, action, details, timestamp, created_at, couple_id").order("created_at", { ascending: false, nullsFirst: false }).limit(500);

          if (error) console.error("[security]", error.message);

          // 3) FILTER IN CODE: same couple (or untagged) AND exactly this user. No fallback.
          const rowMs = (r: any): number => {
            const a = r.created_at ? new Date(r.created_at).getTime() : NaN;
            if (!isNaN(a)) return a;
            const b = r.timestamp ? new Date(String(r.timestamp)).getTime() : NaN;
            return isNaN(b) ? 0 : b;
          };

          const rows = (all || [])
            .filter((r) => !r.couple_id || String(r.couple_id) === coupleId)
            .filter((r) =>
              mineNames.has(
                String(r.username ?? "")
                  .toLowerCase()
                  .trim(),
              ),
            )
            .sort((a, b) => rowMs(b) - rowMs(a))
            .slice(0, 5);

          // Server-side only (Vercel logs, never sent to Telegram): helps fix name mismatches
          console.log("[security] account names:", [...mineNames], "| fetched:", all?.length ?? 0, "| matched:", rows.length);
          if (!rows.length && all?.length) {
            console.log("[security] usernames seen in logs:", [...new Set(all.map((r) => String(r.username)))].slice(0, 20));
          }

          const fmtTime = (r: any) => {
            const ms = r.created_at ? new Date(r.created_at).getTime() : NaN;
            return !isNaN(ms)
              ? new Date(ms).toLocaleString("en-GB", {
                  timeZone: CHAT_TZ,
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : String(r.timestamp ?? "unknown");
          };

          if (error) {
            replyText = head + `\n⚠️ Couldn't load your activity right now. Please try again.`;
          } else if (!rows.length) {
            replyText = head + `<i>Account: <code>${escapeHtml(String(acct.username))}</code></i>\n\n` + `No recent activity found for your account.`;
          } else {
            replyText = head + `<i>Your last 5 activities (${escapeHtml(String(acct.username))})</i>\n\n` + rows.map((r: any) => `• <b>${escapeHtml(String(r.action))}</b>` + (r.details ? ` — ${escapeHtml(String(r.details).slice(0, 80))}` : "") + `\n   🕒 ${escapeHtml(fmtTime(r))}`).join("\n");
          }
        }
      } else if (resolvedCommand === "cards") {
        const user = await getLinkedUser(chatId);
        if (!user) {
          replyText = NOT_LINKED;
        } else {
          const { data: rows, error } = await supabase
            .from("celebration_cards")
            .select("title, type, target_date")
            .eq("couple_id", user.couple_id || "couple_default")
            .order("target_date", { ascending: true })
            .limit(10);
          if (error) console.error("[cards]", error.message);

          replyText = error ? `🎁 <b>Moments &amp; Cards</b>\n\n⚠️ Couldn't load your cards right now. Please try again.` : `🎁 <b>Moments &amp; Cards</b>\n\n` + (rows?.length ? rows.map((r) => `• <b>${escapeHtml(String(r.title))}</b> (${escapeHtml(String(r.type))}) — ${escapeHtml(String(r.target_date))}${countdownText(r.target_date)}`).join("\n") : `No celebration cards yet. 💕`);
        }
      }

      // 8. Greetings
      else if (lowerText === "hi" || lowerText === "hello" || lowerText === "hey") {
        replyText = `💍 <b>Welcome to Our Home!</b> 💕\n\n` + `Hello <b>${safeName}</b>${displayName}!\n\n` + `Your Chat ID is <code>${chatId}</code>.\n\n` + `Send /help to see all available commands.`;
      }

      // 9. Unknown messages
      else {
        replyText = `💍 <b>Our Home Bot</b> 💕\n\n` + `Hello <b>${safeName}</b>!\n\n` + `Your Chat ID is <code>${chatId}</code>.\n\n` + `I couldn't recognize that command.\n\n` + `Send /help to see the available commands. ✨`;
      }

      // Send Telegram response
      try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "HTML",
          }),
        });

        const telegramResult = await telegramResponse.json();

        if (!telegramResult.ok) {
          console.error("[Telegram Send Message Error]", telegramResult);
        }
      } catch (err) {
        console.error("Failed to reply to webhook update:", err);
      }
    } else {
      console.warn("TELEGRAM_BOT_TOKEN is not configured.");
    }

    return res.status(200).json({
      ok: true,
      received: true,
      chatId,
      username: tgUsername,
      text,
      command: resolvedCommand || null,
      isRecognizedCommand,
      isAccessConfirmation,
    });
  } catch (err: any) {
    console.error("Vercel Telegram webhook handler error:", err);

    return res.status(200).json({
      ok: true,
      error: err.message,
    });
  }
}
