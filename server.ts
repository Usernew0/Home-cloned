import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { createServerSession, createTemporaryAuthPassword, verifyPassword, verifySecret, verifyServerSession } from "./server/auth.js";
import { parseAudioUpload } from "./server/audio.js";
import { generateDate } from "./server/generateDate.js";
import { rolesForPath, requireRole } from "./server/guards.js";
import { refreshFirebaseToken, resolveParticipant, adminSettingsGet, adminSettingsPost, changePassword, proxy, proxyEntry, stripeCheckoutDisabled, twoFactor, verifyLogin } from "./server/handlers.js";

const app = express();
const PORT = 3000;

const isProduction = process.env.NODE_ENV === "production";
const projectRoot = process.cwd();


import { resolveServerSupabaseKey } from "./server/serverKey.js";
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = resolveServerSupabaseKey();
const supabaseAdmin = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function startServer() {
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // Authorization gate for every /api route (deny by default).
  app.use("/api", (req, res, next) => {
    const roles = rolesForPath(req.method, req.path);
    if (roles === null) return next();
    if (!requireRole(req, res, roles)) return;
    next();
  });

  // API health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Secure Backend Proxy for Admin Settings
  app.get("/api/admin-settings", adminSettingsGet);

  app.post("/api/admin-settings", adminSettingsPost);

  // Secure Backend Proxy for All Supabase Database Operations
  app.post("/api/proxy", proxyEntry);
  app.post("/api/chat/resolve-participant", resolveParticipant);

  // Secure Server-Side Login Verification Endpoint (Prevents network data exposure before login)
  app.post("/api/auth/verify-login", verifyLogin);
  app.post("/api/auth/refresh-firebase-token", refreshFirebaseToken);
  app.post("/api/auth/change-password", changePassword);
  app.post("/api/auth/two-factor", twoFactor);

  // AI Date Night Itinerary Generator Endpoint (Pro Feature)
  app.post("/api/generate-date", generateDate);

  // Stripe Checkout Session Endpoint (Simulated / Real Handler)
  // Payments are not implemented: fail closed instead of faking a completed checkout.
  app.post("/api/stripe/checkout", stripeCheckoutDisabled);

  // Telegram Senders Cache & Memory Buffer
  interface TelegramCapturedSender {
    chatId: string;
    username: string;
    firstName: string;
    lastName?: string;
    text: string;
    date: number;
    timestamp: string;
    isConfirmedCommand?: boolean;
  }

  let lastKnownBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
  let capturedTelegramSenders: TelegramCapturedSender[] = [];
  const processedUpdateIds = new Set<number>();

  const sendersCachePath = path.join(projectRoot, "public", "telegram_senders.json");
  try {
    if (fs.existsSync(sendersCachePath)) {
      const raw = fs.readFileSync(sendersCachePath, "utf-8");
      capturedTelegramSenders = JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Could not load cached telegram senders:", e);
  }

  function recordCapturedSender(sender: TelegramCapturedSender) {
    const existingIdx = capturedTelegramSenders.findIndex((s) => s.chatId === sender.chatId);
    if (existingIdx >= 0) {
      capturedTelegramSenders[existingIdx] = {
        ...capturedTelegramSenders[existingIdx],
        ...sender,
        username: sender.username || capturedTelegramSenders[existingIdx].username,
        text: sender.text || capturedTelegramSenders[existingIdx].text,
        date: sender.date || capturedTelegramSenders[existingIdx].date,
        timestamp: new Date().toISOString(),
        isConfirmedCommand: sender.isConfirmedCommand ?? capturedTelegramSenders[existingIdx].isConfirmedCommand,
      };
    } else {
      capturedTelegramSenders.unshift(sender);
    }
    if (capturedTelegramSenders.length > 100) {
      capturedTelegramSenders = capturedTelegramSenders.slice(0, 100);
    }
    try {
      const pubDir = path.join(projectRoot, "public");
      if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
      fs.writeFileSync(sendersCachePath, JSON.stringify(capturedTelegramSenders, null, 2));
    } catch (err) {
      // ignore
    }
  }

  // Telegram Bot Dispatch Endpoint
  app.post("/api/telegram/send", async (req, res) => {
    try {
      const { chatId, text, parseMode = "HTML" } = req.body;
      const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
      const chat = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

      if (token) lastKnownBotToken = token;

      if (!token || !chat) {
        return res.status(400).json({
          success: false,
          error: "Missing botToken or chatId. Configure your Telegram Bot credentials in Admin Panel.",
        });
      }

      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, error: "Message text is required." });
      }

      const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(telegramUrl, {
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
        return res.status(response.status || 400).json({
          success: false,
          error: result.description || "Telegram API returned an error",
          errorCode: result.error_code,
        });
      }

      return res.json({ success: true, messageId: result.result?.message_id });
    } catch (err: any) {
      console.error("Telegram send message error:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error dispatching Telegram alert" });
    }
  });

  // Telegram Bot Connection Test Endpoint
  app.post("/api/telegram/test", async (req, res) => {
    try {
      const { chatId } = req.body;
      const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
      const chat = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

      if (token) lastKnownBotToken = token;

      if (!token || !chat) {
        return res.status(400).json({
          success: false,
          error: "Please enter both the Bot Token and Chat ID to run the test.",
        });
      }

      const testMessage = `🎉 <b>Our Home Telegram Alert Test</b>\n\n` + `Your Telegram bot is successfully connected to <b>Our Home</b>! 💕\n` + `You will now receive milestone countdowns, date reminders, love letter alerts, and security notifications directly in this chat.\n\n` + `<i>Time: ${new Date().toLocaleString()}</i>`;

      const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: testMessage,
          parse_mode: "HTML",
        }),
      });

      const result = (await response.json()) as any;

      if (!response.ok || !result.ok) {
        return res.status(response.status || 400).json({
          success: false,
          error: result.description || "Telegram API rejected the test message",
          errorCode: result.error_code,
        });
      }

      return res.json({ success: true, message: "Test message sent successfully to Telegram!" });
    } catch (err: any) {
      console.error("Telegram test error:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to connect to Telegram API" });
    }
  });

  // Telegram Bot Comprehensive Diagnostics & Ping Endpoint
  app.post("/api/telegram/diagnose", async (req, res) => {
    const startTime = Date.now();
    try {
      const { chatId, testMessage } = req.body;
      const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
      const chat = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

      if (token) lastKnownBotToken = token;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "Bot Token is required to run diagnostics.",
          latencyMs: Date.now() - startTime,
          checks: {
            tokenProvided: false,
            apiReachable: false,
            botAuthenticated: false,
            webhookHealthy: false,
            testMessageDelivered: false,
          },
        });
      }

      // Check 1: Call getMe to verify bot token and get identity
      const getMeUrl = `https://api.telegram.org/bot${token}/getMe`;
      const meRes = await fetch(getMeUrl);
      const latencyMs = Date.now() - startTime;
      const meData = (await meRes.json()) as any;

      if (!meRes.ok || !meData.ok) {
        return res.status(200).json({
          success: false,
          error: meData.description || `Telegram API rejected token (HTTP ${meRes.status})`,
          errorCode: meData.error_code,
          latencyMs,
          bot: null,
          webhook: null,
          checks: {
            tokenProvided: true,
            apiReachable: true,
            botAuthenticated: false,
            webhookHealthy: false,
            testMessageDelivered: false,
          },
          rawTelegramResponse: meData,
        });
      }

      const botInfo = meData.result;

      // Check 2: Inspect Webhook status
      let webhookInfo: any = null;
      let webhookHealthy = true;
      try {
        const hookRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
        const hookData = (await hookRes.json()) as any;
        if (hookData.ok) {
          webhookInfo = hookData.result;
          if (webhookInfo.last_error_message) {
            webhookHealthy = false;
          }
        }
      } catch (hookErr: any) {
        console.warn("Webhook inspect warning during diagnostics:", hookErr);
      }

      // Resolve chat (could be numeric Chat ID or @username)
      let resolvedChat = "";
      let usernameResolved = false;

      if (chat) {
        if (/^-?\d+$/.test(chat)) {
          resolvedChat = chat;
        } else {
          // It's a username! Resolve to numeric chatId
          const cleanUsername = chat.replace(/^@/, "").toLowerCase();

          // 1. Check capturedTelegramSenders cache
          const matchedSender = capturedTelegramSenders.find((s) => (s.username || "").toLowerCase().replace(/^@/, "") === cleanUsername || (s.firstName || "").toLowerCase().includes(cleanUsername));
          if (matchedSender) {
            resolvedChat = matchedSender.chatId;
            usernameResolved = true;
          }

          // 2. If not found in cache, fetch /getUpdates from Telegram
          if (!resolvedChat) {
            try {
              const updRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=["message"]`);
              const updData = (await updRes.json()) as any;
              if (updData.ok && Array.isArray(updData.result)) {
                for (const u of updData.result) {
                  const msg = u.message || u.edited_message;
                  if (msg && msg.from && msg.chat) {
                    const uName = (msg.from.username || msg.chat.username || "").toLowerCase().replace(/^@/, "");
                    if (uName === cleanUsername) {
                      resolvedChat = String(msg.chat.id);
                      usernameResolved = true;
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("Failed to resolve username from getUpdates:", e);
            }
          }
        }
      }

      // Check 3: Send test message if resolvedChat available
      let testMessageDelivered = false;
      let testMessageResult: any = null;
      let testMessageError: string | null = null;

      if (resolvedChat) {
        const payloadText =
          testMessage ||
          `🔬 <b>Telegram Bot Health Check & Diagnostic Ping</b>\n\n` +
            `• <b>Bot:</b> @${botInfo.username || "unknown"} (${botInfo.first_name || "Bot"})\n` +
            `• <b>API Status:</b> Authenticated & Online 🟢\n` +
            `• <b>Recipient:</b> <code>${chat}</code> ${usernameResolved ? "(Resolved to ID: " + resolvedChat + ")" : ""}\n` +
            `• <b>Webhook:</b> ${webhookInfo?.url ? "Active (" + webhookInfo.url + ")" : "None (Polling Mode)"}\n` +
            `• <b>Ping Latency:</b> ${latencyMs} ms\n` +
            `• <b>Timestamp:</b> ${new Date().toISOString()}\n\n` +
            `<i>Connection confirmed from Our Home Admin Panel.</i> 💕`;

        const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: resolvedChat,
            text: payloadText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });

        const sendData = (await sendRes.json()) as any;
        if (sendRes.ok && sendData.ok) {
          testMessageDelivered = true;
          testMessageResult = sendData.result;
        } else {
          testMessageError = sendData.description || `HTTP ${sendRes.status} dispatch error`;
          testMessageResult = sendData;
        }
      } else if (chat) {
        testMessageError = `Username '${chat}' was provided, but no numeric Chat ID could be resolved from recent Telegram messages. Ask user to send /start or /confirm to the bot first!`;
      }

      const totalLatencyMs = Date.now() - startTime;

      return res.json({
        success: true,
        latencyMs: totalLatencyMs,
        timestamp: new Date().toISOString(),
        bot: {
          id: botInfo.id,
          username: botInfo.username,
          firstName: botInfo.first_name,
          canJoinGroups: botInfo.can_join_groups,
          canReadAllGroupMessages: botInfo.can_read_all_group_messages,
          supportsInlineQueries: botInfo.supports_inline_queries,
        },
        webhook: webhookInfo,
        destinationChatId: chat || null,
        testMessageSent: !!chat,
        testMessageDelivered,
        testMessageError,
        testMessageResult,
        rawTelegramResponse: {
          getMe: meData,
          getWebhookInfo: webhookInfo,
          sendMessage: testMessageResult,
        },
        checks: {
          tokenProvided: true,
          apiReachable: true,
          botAuthenticated: true,
          canJoinGroups: !!botInfo.can_join_groups,
          canReadAllGroupMessages: !!botInfo.can_read_all_group_messages,
          webhookHealthy,
          testMessageDelivered: !!chat ? testMessageDelivered : null,
        },
      });
    } catch (err: any) {
      console.error("Telegram diagnostics error:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Diagnostic test encountered an unhandled server error",
        latencyMs: Date.now() - startTime,
        checks: {
          tokenProvided: true,
          apiReachable: false,
          botAuthenticated: false,
          webhookHealthy: false,
          testMessageDelivered: false,
        },
      });
    }
  });

  // Telegram Get Updates & Map Usernames Route (with auto-409 webhook unlock)
  app.post("/api/telegram/updates", async (req, res) => {
    try {
      const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
      if (!token) {
        return res.status(400).json({ success: false, error: "Bot Token is required." });
      }

      if (token) lastKnownBotToken = token;

      let response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=["message"]`);
      let result = (await response.json()) as any;
      let webhookReleased = false;

      // Handle 409 Conflict: when a webhook is active, getUpdates fails with 409
      // We automatically delete the webhook with drop_pending_updates: false to preserve user messages
      if (!response.ok && (response.status === 409 || result?.error_code === 409)) {
        console.log("[Telegram Updates] 409 Conflict detected (webhook active). Auto-releasing webhook to retrieve pending messages...");
        try {
          const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drop_pending_updates: false }),
          });
          const delResult = (await delRes.json()) as any;
          console.log("[Telegram Updates] Released webhook:", delResult);
          webhookReleased = true;

          // Wait brief moment for Telegram to unlock
          await new Promise((r) => setTimeout(r, 350));
          response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=["message"]`);
          result = (await response.json()) as any;
        } catch (delErr) {
          console.error("[Telegram Updates] Failed to auto-release webhook:", delErr);
        }
      }

      if (!response.ok || !result.ok) {
        // Even if Telegram API fails, return captured webhook senders if available
        if (capturedTelegramSenders.length > 0) {
          const mappedUsers: { [username: string]: { chatId: string; firstName: string; date: number; text?: string } } = {};
          for (const s of capturedTelegramSenders) {
            if (s.username) {
              mappedUsers[s.username.toLowerCase()] = { chatId: s.chatId, firstName: s.firstName, date: s.date, text: s.text };
              mappedUsers[s.username.replace(/^@/, "").toLowerCase()] = { chatId: s.chatId, firstName: s.firstName, date: s.date, text: s.text };
            }
          }
          return res.json({
            success: true,
            count: Object.keys(mappedUsers).length,
            users: mappedUsers,
            senders: capturedTelegramSenders,
            fromCacheOnly: true,
            warning: result?.description || "Telegram getUpdates unavailable",
          });
        }

        return res.status(response.status || 400).json({
          success: false,
          error: result?.description || "Failed to fetch updates from Telegram",
        });
      }

      // Parse and map all users who messaged the bot
      const mappedUsers: { [username: string]: { chatId: string; firstName: string; date: number; text?: string } } = {};
      const updates = Array.isArray(result.result) ? result.result : [];

      for (const u of updates) {
        const msg = u.message || u.edited_message;
        if (msg && msg.from && msg.chat) {
          const rawUser = msg.from.username || msg.chat.username || "";
          const chatIdStr = String(msg.chat.id);
          const fName = msg.from.first_name || msg.chat.first_name || "";
          const lName = msg.from.last_name || msg.chat.last_name || "";
          const msgText = (msg.text || "").trim();
          const lower = msgText.toLowerCase();
          const isCmd = lower === "start" || lower === "/start" || lower === "confirm" || lower === "/confirm" || lower === "access" || lower === "/access" || lower === "verify" || lower === "/verify" || lower.startsWith("/start") || lower.startsWith("start") || lower.startsWith("/confirm") || lower.startsWith("confirm") || lower === "id" || lower === "/id" || lower === "/chatid";

          recordCapturedSender({
            chatId: chatIdStr,
            username: rawUser ? `@${rawUser.toLowerCase()}` : "",
            firstName: fName,
            lastName: lName,
            text: msgText,
            date: msg.date || Math.floor(Date.now() / 1000),
            timestamp: new Date().toISOString(),
            isConfirmedCommand: isCmd,
          });

          if (rawUser) {
            const normalized = `@${rawUser.toLowerCase().trim()}`;
            const bare = rawUser.toLowerCase().trim();
            mappedUsers[normalized] = {
              chatId: chatIdStr,
              firstName: fName,
              date: msg.date,
              text: msgText,
            };
            mappedUsers[bare] = {
              chatId: chatIdStr,
              firstName: fName,
              date: msg.date,
              text: msgText,
            };
          }

          if (fName) {
            mappedUsers[fName.toLowerCase().trim()] = {
              chatId: chatIdStr,
              firstName: fName,
              date: msg.date,
              text: msgText,
            };
          }
        }
      }

      // Also merge any captured senders from webhook buffer
      for (const s of capturedTelegramSenders) {
        if (s.username) {
          const withAt = s.username.toLowerCase().trim();
          const bare = withAt.replace(/^@/, "");
          if (!mappedUsers[withAt]) {
            mappedUsers[withAt] = { chatId: s.chatId, firstName: s.firstName, date: s.date, text: s.text };
          }
          if (!mappedUsers[bare]) {
            mappedUsers[bare] = { chatId: s.chatId, firstName: s.firstName, date: s.date, text: s.text };
          }
        }
        if (s.firstName && !mappedUsers[s.firstName.toLowerCase().trim()]) {
          mappedUsers[s.firstName.toLowerCase().trim()] = { chatId: s.chatId, firstName: s.firstName, date: s.date, text: s.text };
        }
      }

      return res.json({
        success: true,
        count: Object.keys(mappedUsers).length,
        users: mappedUsers,
        senders: capturedTelegramSenders,
        rawUpdatesCount: updates.length,
        webhookReleased,
      });
    } catch (err: any) {
      console.error("Get updates error:", err);
      return res.status(500).json({ success: false, error: err.message || "Error fetching updates" });
    }
  });

  // Captured Senders Feed Endpoint
  app.get("/api/telegram/senders", (req, res) => {
    res.json({
      success: true,
      count: capturedTelegramSenders.length,
      senders: capturedTelegramSenders,
    });
  });

  // Clear Captured Senders Endpoint
  app.post("/api/telegram/senders/clear", (req, res) => {
    capturedTelegramSenders = [];
    try {
      if (fs.existsSync(sendersCachePath)) {
        fs.writeFileSync(sendersCachePath, JSON.stringify([], null, 2));
      }
    } catch (e) {
      // ignore
    }
    res.json({ success: true, message: "Captured senders reset successfully" });
  });

  // Client record sender endpoint
  app.post("/api/telegram/senders/record", (req, res) => {
    const sender = req.body;
    if (sender && sender.chatId) {
      recordCapturedSender(sender);
    }
    res.json({ success: true, count: capturedTelegramSenders.length });
  });

  // Telegram Incoming Webhook Handler (Receives updates when users message the bot)
  app.post("/api/telegram/webhook", async (req, res) => {
    const configuredWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!verifySecret(req.headers["x-telegram-bot-api-secret-token"], configuredWebhookSecret, isProduction)) {
      return res.status(401).json({ ok: false, error: "Unauthorized webhook request" });
    }

    try {
      const update = req.body;
      const updateId = update?.update_id;
      if (updateId && processedUpdateIds.has(updateId)) {
        return res.json({ ok: true, note: "Duplicate update ignored" });
      }
      if (updateId) {
        processedUpdateIds.add(updateId);
        if (processedUpdateIds.size > 500) {
          const first = processedUpdateIds.values().next().value;
          if (first !== undefined) processedUpdateIds.delete(first);
        }
      }

      const message = update?.message || update?.edited_message;

      if (!message || !message.chat) {
        return res.json({ ok: true, note: "No message payload" });
      }

      const chatId = String(message.chat.id);
      const fromUser = message.from || {};
      const rawUser = fromUser.username || message.chat.username || "";
      const tgUsername = rawUser ? `@${rawUser}` : "";
      const firstName = fromUser.first_name || message.chat.first_name || "Lover";
      const lastName = fromUser.last_name || message.chat.last_name || "";
      const text = (message.text || "").trim();
      const lowerText = text.toLowerCase();

      // Check for confirmation command (accepts bare words and slash commands)
      const isConfirmedCommand = lowerText === "start" || lowerText === "/start" || lowerText === "confirm" || lowerText === "/confirm" || lowerText === "access" || lowerText === "/access" || lowerText === "verify" || lowerText === "/verify" || lowerText === "ok" || lowerText === "yes" || lowerText.startsWith("/start") || lowerText.startsWith("start") || lowerText.startsWith("/confirm") || lowerText.startsWith("confirm") || lowerText === "id" || lowerText === "/id" || lowerText === "/chatid";

      console.log(`[Telegram Webhook] Received message from ${tgUsername || firstName} (${chatId}): "${text}" (isConfirmedCommand=${isConfirmedCommand})`);

      // Record sender into persistent buffer immediately
      recordCapturedSender({
        chatId,
        username: tgUsername ? tgUsername.toLowerCase() : "",
        firstName,
        lastName,
        text,
        date: message.date || Math.floor(Date.now() / 1000),
        timestamp: new Date().toISOString(),
        isConfirmedCommand,
      });

      // Respond automatically if bot token is available
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        let replyText = "";

        if (isConfirmedCommand || lowerText === "hi" || lowerText === "hello") {
          replyText =
            `✅ <b>Access Confirmed & Verified!</b> 🎉\n\n` +
            `Hello <b>${firstName}</b> (${tgUsername ? "<code>" + tgUsername + "</code>" : "Your Chat"})!\n\n` +
            `Your Telegram account is now successfully confirmed and linked with <b>Our Home</b>.\n` +
            `• <b>Chat ID:</b> <code>${chatId}</code>\n` +
            `• <b>Status:</b> Active Recipient 🟢\n\n` +
            `You will now receive personalized real-time alerts for anniversaries 💍, dates 🗓️, love letters 💌, and sweet chats 💬!\n\n` +
            `<i>Tip: Send /status anytime to inspect your active bot connection.</i> 💕`;
        } else if (lowerText === "/milestones" || lowerText === "milestones" || lowerText === "/countdown") {
          replyText = `💍 <b>Milestones & Anniversaries Alert Section</b>\n\n` + `Your account is actively subscribed to milestone countdowns, anniversary reminders, and celebration pings! 💍✨\n\n` + `<i>Use /status to inspect all active alert sections.</i>`;
        } else if (lowerText === "/dates" || lowerText === "dates" || lowerText === "datenight") {
          replyText = `🗓️ <b>Date Night Reminders Alert Section</b>\n\n` + `Your account is actively subscribed to date night plans, itineraries, and checklist alerts! 🗓️🍷\n\n` + `<i>Use /status to inspect all active alert sections.</i>`;
        } else if (lowerText === "/letters" || lowerText === "letters" || lowerText === "loveletters") {
          replyText = `💌 <b>Sealed Love Letters Alert Section</b>\n\n` + `Your account is actively subscribed to instant alerts when your partner seals a new love letter! 💌✨\n\n` + `<i>Use /status to inspect all active alert sections.</i>`;
        } else if (lowerText === "/chat" || lowerText === "chat" || lowerText === "messages") {
          replyText = `💬 <b>Sweet Chat Messages Alert Section</b>\n\n` + `Your account is actively subscribed to direct notifications when your partner sends a chat message! 💬💕\n\n` + `<i>Use /status to inspect all active alert sections.</i>`;
        } else if (lowerText === "/security" || lowerText === "security" || lowerText === "shield") {
          replyText = `🛡️ <b>Security & Login Alerts Section</b>\n\n` + `Your account is actively subscribed to suspicious login, failed password attempts, and 2FA lockouts! 🛡️⚠️\n\n` + `<i>Use /status to inspect all active alert sections.</i>`;
        } else if (lowerText === "/cards" || lowerText === "cards" || lowerText === "moments") {
          replyText = `🎉 <b>Choose Moment & Cards Alert Section</b>\n\n` + `Your account is actively subscribed to celebration cards and moment unlocks! 🎉✨\n\n` + `<i>Use /status to inspect all active alert sections.</i>`;
        } else if (lowerText === "/id" || lowerText === "/chatid" || lowerText === "id" || lowerText === "chatid") {
          replyText = `🆔 <b>Your Telegram Credentials:</b>\n\n` + `• Chat ID: <code>${chatId}</code>\n` + (tgUsername ? `• Username: <b>${tgUsername}</b>\n\n` : "\n") + `Your Chat ID is registered! Send <b>confirm</b> or <b>/confirm</b> to complete verification.`;
        } else if (lowerText === "/status" || lowerText === "status") {
          replyText =
            `📊 <b>Our Home Alert Connection Status:</b>\n\n` +
            `• Name: <b>${firstName}</b>\n` +
            (tgUsername ? `• Telegram: <code>${tgUsername}</code>\n` : "") +
            `• Chat ID: <code>${chatId}</code>\n` +
            `• Alerts Engine: <b>Online & Receiving Alerts 🟢</b>\n\n` +
            `<b>Active Subscribed Sections:</b>\n` +
            `• 💍 Milestones & Anniversaries (/milestones)\n` +
            `• 🗓️ Date Night Reminders (/dates)\n` +
            `• 💌 Sealed Love Letters (/letters)\n` +
            `• 💬 Sweet Chat Messages (/chat)\n` +
            `• 🛡️ Security & Login Alerts (/security)\n` +
            `• 🎉 Choose Moment & Cards (/cards)\n\n` +
            `<i>System Time: ${new Date().toLocaleString()}</i>`;
        } else if (lowerText === "/help" || lowerText === "help") {
          replyText =
            `🤖 <b>Our Home Telegram Bot Commands:</b>\n\n` +
            `• <code>/confirm</code> - Confirm access and register for alerts\n` +
            `• <code>/milestones</code> - Milestones & Anniversaries section\n` +
            `• <code>/dates</code> - Date Night reminders section\n` +
            `• <code>/letters</code> - Sealed Love Letters section\n` +
            `• <code>/chat</code> - Sweet Chat Messages section\n` +
            `• <code>/security</code> - Security & Login alerts section\n` +
            `• <code>/cards</code> - Choose Moment & Cards section\n` +
            `• <code>/status</code> - Check active subscriptions & status\n` +
            `• <code>/help</code> - Show this command guide`;
        } else {
          replyText = `💍 <b>Our Home Bot</b> 💕\n\n` + `Hello <b>${firstName}</b> (${tgUsername ? "<code>" + tgUsername + "</code>" : ""})!\n` + `Your Chat ID is <code>${chatId}</code>.\n\n` + `Send <b>/confirm</b> to activate alerts, or <b>/help</b> to view all section commands! ✨`;
        }

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "HTML",
          }),
        }).catch((err) => console.warn("Failed to reply to webhook update:", err));
      }

      return res.json({ ok: true, received: true, chatId, username: tgUsername, text, count: capturedTelegramSenders.length });
    } catch (err: any) {
      console.error("Telegram webhook handler error:", err);
      return res.status(200).json({ ok: true, error: err.message });
    }
  });

  // Telegram Webhook Configuration Route
  app.post("/api/telegram/webhook/set", async (req, res) => {
    try {
      const { webhookUrl } = req.body;
      const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
      const url = (webhookUrl || "").trim();

      if (token) lastKnownBotToken = token;

      if (!token || !url) {
        return res.status(400).json({ success: false, error: "Bot Token and Webhook URL are required." });
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          drop_pending_updates: false,
        }),
      });

      const result = (await response.json()) as any;
      if (!response.ok || !result.ok) {
        return res.status(response.status || 400).json({
          success: false,
          error: result.description || "Failed to set webhook on Telegram API",
        });
      }

      return res.json({ success: true, message: result.description || "Webhook activated successfully!" });
    } catch (err: any) {
      console.error("Set webhook error:", err);
      return res.status(500).json({ success: false, error: err.message || "Server error setting webhook" });
    }
  });

  // Telegram Webhook Info Route
  app.post("/api/telegram/webhook/info", async (req, res) => {
    try {
      const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();

      if (token) lastKnownBotToken = token;

      if (!token) {
        return res.status(400).json({ success: false, error: "Bot Token is required." });
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const result = (await response.json()) as any;

      if (!response.ok || !result.ok) {
        return res.status(response.status || 400).json({
          success: false,
          error: result.description || "Failed to fetch webhook info",
        });
      }

      return res.json({ success: true, info: result.result });
    } catch (err: any) {
      console.error("Get webhook info error:", err);
      return res.status(500).json({ success: false, error: err.message || "Server error fetching webhook info" });
    }
  });

  // Telegram Webhook Delete Route
  app.post("/api/telegram/webhook/delete", async (req, res) => {
    try {
      const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();

      if (token) lastKnownBotToken = token;

      if (!token) {
        return res.status(400).json({ success: false, error: "Bot Token is required." });
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_pending_updates: false }),
      });

      const result = (await response.json()) as any;
      if (!response.ok || !result.ok) {
        return res.status(response.status || 400).json({
          success: false,
          error: result.description || "Failed to delete webhook",
        });
      }

      return res.json({ success: true, message: result.description || "Webhook deleted successfully!" });
    } catch (err: any) {
      console.error("Delete webhook error:", err);
      return res.status(500).json({ success: false, error: err.message || "Server error deleting webhook" });
    }
  });

  // Dedicated Audio / MP3 Upload Endpoint
  app.post("/api/upload-audio", async (req, res) => {
    try {
      const { fileName, dataUrl, title, artist } = req.body;
      if (!fileName || !dataUrl) {
        return res.status(400).json({ success: false, error: "File name and audio data are required." });
      }

      const uploadsDir = path.join(projectRoot, "public", "audio", "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = path.extname(fileName).toLowerCase();
      const cleanBase = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, "_");

      let parsedUpload;
      try {
        parsedUpload = parseAudioUpload(fileName, dataUrl);
      } catch (parseError: any) {
        return res.status(400).json({ success: false, error: parseError.message });
      }

      const safeName = `${Date.now()}_${cleanBase}${parsedUpload.extension}`;
      const filePath = path.join(uploadsDir, safeName);
      fs.writeFileSync(filePath, parsedUpload.buffer);

      const publicUrl = `/audio/uploads/${safeName}`;
      return res.json({
        success: true,
        url: publicUrl,
        fileName: safeName,
        title: title || cleanBase,
      });
    } catch (err: any) {
      console.error("Audio upload error:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to save audio file." });
    }
  });

  // Explicit static route for audio assets
  app.use("/audio", express.static(path.join(projectRoot, "public", "audio")));

  if (!isProduction) {
    // Use Vite dev server as middleware in non-production mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets from dist/ folder
    const distPath = path.join(projectRoot, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (Production: ${isProduction})`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
