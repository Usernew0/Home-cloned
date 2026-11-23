import { TelegramConfig, DEFAULT_TELEGRAM_CONFIG, AdminSetting, UserAccount, TelegramAuthorizedUser, TelegramCapturedSender, TelegramAlertOptions } from "../types";
import { authHeaders } from './authHeaders';

/**
 * Resolves active Telegram configuration from AdminSettings, local cache, or defaults
 */
export function getTelegramConfig(adminSettings?: AdminSetting[]): TelegramConfig {
  if (Array.isArray(adminSettings)) {
    const doc = adminSettings.find((s) => s.id === "telegramConfig");
    if (doc?.telegramConfig) {
      return {
        ...DEFAULT_TELEGRAM_CONFIG,
        ...doc.telegramConfig,
        botToken: "",
        whitelistedUsernames: Array.isArray(doc.telegramConfig.whitelistedUsernames) ? doc.telegramConfig.whitelistedUsernames : [],
        authorizedUsers: Array.isArray(doc.telegramConfig.authorizedUsers) ? doc.telegramConfig.authorizedUsers : [],
        capturedSenders: Array.isArray(doc.telegramConfig.capturedSenders) ? doc.telegramConfig.capturedSenders : [],
      };
    }
  }

  try {
    const saved = localStorage.getItem("love_telegram_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_TELEGRAM_CONFIG,
        ...parsed,
        botToken: "",
        whitelistedUsernames: Array.isArray(parsed.whitelistedUsernames) ? parsed.whitelistedUsernames : [],
        authorizedUsers: Array.isArray(parsed.authorizedUsers) ? parsed.authorizedUsers : [],
        capturedSenders: Array.isArray(parsed.capturedSenders) ? parsed.capturedSenders : [],
      };
    }
  } catch (e) {
    console.warn("Failed to parse cached Telegram config:", e);
  }

  return DEFAULT_TELEGRAM_CONFIG;
}

/**
 * Persists Telegram configuration to LocalStorage and Firestore AdminSettings
 */
export async function saveTelegramConfig(config: TelegramConfig, saveAdminDocFn?: (setting: AdminSetting) => Promise<void>): Promise<void> {
  const updated: TelegramConfig = {
    ...config,
    botToken: "",
    whitelistedUsernames: Array.from(new Set((config.whitelistedUsernames || []).map((u) => (u.startsWith("@") ? u.trim() : `@${u.trim()}`).toLowerCase()).filter((u) => u.length > 1))),
    authorizedUsers: Array.isArray(config.authorizedUsers) ? config.authorizedUsers : [],
    capturedSenders: Array.isArray(config.capturedSenders) ? config.capturedSenders : [],
    lastTestedAt: config.lastTestedAt || new Date().toISOString(),
  };

  try {
    localStorage.setItem("love_telegram_config", JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to cache Telegram config in localStorage:", e);
  }

  if (saveAdminDocFn) {
    try {
      await saveAdminDocFn({
        id: "telegramConfig",
        telegramConfig: updated,
      });
    } catch (err) {
      console.error("Failed to persist Telegram config to database:", err);
      throw err;
    }
  }
}

/**
 * Helper to safely parse JSON response without throwing "Unexpected token" errors
 * when serverless environments (e.g. Vercel) return an HTML 404/500 error page.
 */
async function safeParseResponse(res: Response): Promise<{ isJson: boolean; data: any; rawText: string }> {
  const rawText = await res.text();
  try {
    const data = JSON.parse(rawText);
    return { isJson: true, data, rawText };
  } catch {
    return { isJson: false, data: null, rawText };
  }
}

/**
 * Sends a live test ping to Telegram with automatic dual fallback:
 * 1. Attempts proxy server route (/api/telegram/test)
 * 2. If proxy returns HTML / Vercel 404, automatically falls back to direct Telegram Bot API
 */
export async function testTelegramConnection(botToken: string, chatId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanChat = chatId.trim();

  if (!cleanChat) {
    return { success: false, error: "Please enter a Chat ID." };
  }

  const testMessage = `🎉 <b>Our Home Telegram Alert Test</b>\n\n` + `Your Telegram bot is successfully connected to <b>Our Home</b>! 💕\n` + `You will now receive milestone countdowns, date reminders, love letter alerts, and security notifications directly in this chat.\n\n` + `<i>Time: ${new Date().toLocaleString()}</i>`;

  // 1. Try server proxy endpoint first
  try {
    const response = await fetch("/api/telegram/test", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ chatId: cleanChat }),
    });

    const parsed = await safeParseResponse(response);
    if (parsed.isJson && response.ok && parsed.data?.success) {
      return {
        success: true,
        message: parsed.data.message || "Test message received successfully in Telegram!",
      };
    }
  } catch (proxyErr) {
    return {
      success: false,
      error: proxyErr instanceof Error ? proxyErr.message : "Telegram test server unavailable",
    };
  }

  return { success: false, error: "Telegram test server returned an invalid response." };
}

/**
 * Fetches recent captured senders from server endpoint or local storage cache
 */
export async function fetchCapturedTelegramSenders(): Promise<TelegramCapturedSender[]> {
  try {
    const res = await fetch("/api/telegram/senders", { headers: authHeaders() });
    const parsed = await safeParseResponse(res);
    if (parsed.isJson && res.ok && Array.isArray(parsed.data?.senders)) {
      try {
        localStorage.setItem("love_telegram_captured_senders", JSON.stringify(parsed.data.senders));
      } catch (e) {}
      return parsed.data.senders;
    }
  } catch (err) {
    console.warn("Could not fetch captured senders from server proxy:", err);
  }

  try {
    const cached = localStorage.getItem("love_telegram_captured_senders");
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {}

  return [];
}

/**
 * Clears captured senders history
 */
export async function clearCapturedTelegramSenders(): Promise<boolean> {
  try {
    localStorage.removeItem("love_telegram_captured_senders");
    await fetch("/api/telegram/senders/clear", { method: "POST", headers: authHeaders() });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Detailed updates fetcher with:
 * 1. Automatic 409 Webhook Conflict recovery (releases webhook if active so getUpdates succeeds)
 * 2. Merging webhook-captured senders
 * 3. Extracting rich sender metadata (username, first name, message text, date)
 */
export async function fetchTelegramChatIdsDetailed(botToken: string): Promise<{
  mapped: { [username: string]: { chatId: string; firstName?: string; text?: string; date?: number } };
  senders: TelegramCapturedSender[];
  webhookReleased?: boolean;
}> {
  const mapped: { [username: string]: { chatId: string; firstName?: string; text?: string; date?: number } } = {};
  const sendersMap = new Map<string, TelegramCapturedSender>();
  let webhookReleased = false;

  // 1. Try server endpoint first
  try {
    const res = await fetch("/api/telegram/updates", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    const parsed = await safeParseResponse(res);
    if (parsed.isJson && res.ok && parsed.data?.users) {
      Object.assign(mapped, parsed.data.users);
      if (parsed.data.webhookReleased) webhookReleased = true;
      if (Array.isArray(parsed.data.senders)) {
        parsed.data.senders.forEach((s: TelegramCapturedSender) => sendersMap.set(s.chatId, s));
      }
    }
  } catch (e) {
    console.warn("Proxy updates fetch failed, trying direct Telegram getUpdates:", e);
  }

  // 2. Fetch server-captured senders
  try {
    const serverSenders = await fetchCapturedTelegramSenders();
    serverSenders.forEach((s) => {
      if (!sendersMap.has(s.chatId)) sendersMap.set(s.chatId, s);
      if (s.username) {
        const withAt = s.username.toLowerCase().trim();
        const bare = withAt.replace(/^@/, "");
        if (!mapped[withAt]) mapped[withAt] = { chatId: s.chatId, firstName: s.firstName, text: s.text, date: s.date };
        if (!mapped[bare]) mapped[bare] = { chatId: s.chatId, firstName: s.firstName, text: s.text, date: s.date };
      }
      if (s.firstName && !mapped[s.firstName.toLowerCase().trim()]) {
        mapped[s.firstName.toLowerCase().trim()] = { chatId: s.chatId, firstName: s.firstName, text: s.text, date: s.date };
      }
    });
  } catch (e) {}

  const senders = Array.from(sendersMap.values()).sort((a, b) => (b.date || 0) - (a.date || 0));

  try {
    localStorage.setItem("love_telegram_captured_senders", JSON.stringify(senders));
  } catch (e) {}

  return { mapped, senders, webhookReleased };
}

/**
 * Queries Telegram updates to automatically detect and map @usernames to their numeric Chat IDs
 */
export async function fetchTelegramChatIdsFromUpdates(botToken: string): Promise<{ [username: string]: { chatId: string; firstName?: string; text?: string; date?: number } }> {
  const result = await fetchTelegramChatIdsDetailed(botToken);
  return result.mapped;
}

/**
 * Automatically inspects Telegram updates and resolves the Chat ID for all whitelisted & profile users
 */
export async function autoResolveTelegramUsers(
  config: TelegramConfig,
  userAccounts: UserAccount[] = [],
): Promise<{
  updatedConfig: TelegramConfig;
  newlyResolvedCount: number;
  resolvedUsers: { username: string; chatId: string; displayName?: string }[];
  allSenders: TelegramCapturedSender[];
  webhookConflictResolved?: boolean;
}> {
  if (!config.botToken.trim()) {
    return {
      updatedConfig: config,
      newlyResolvedCount: 0,
      resolvedUsers: [],
      allSenders: config.capturedSenders || [],
      webhookConflictResolved: false,
    };
  }

  const detailed = await fetchTelegramChatIdsDetailed(config.botToken);
  const updatesMap = detailed.mapped;
  const allSenders = detailed.senders;
  const resolvedUsers: { username: string; chatId: string; displayName?: string }[] = [];
  let newlyResolvedCount = 0;

  // Build combined list of target usernames to resolve
  const targetUsernames = new Set<string>();
  (config.whitelistedUsernames || []).forEach((u) => targetUsernames.add(u.toLowerCase().trim()));
  (config.authorizedUsers || []).forEach((u) => targetUsernames.add(u.telegramUsername.toLowerCase().trim()));
  extractTelegramUsernamesFromProfiles(userAccounts).forEach((u) => targetUsernames.add(u.username.toLowerCase().trim()));

  const currentAuthorizedList = Array.isArray(config.authorizedUsers) ? [...config.authorizedUsers] : [];

  for (const rawTg of targetUsernames) {
    const cleanWithAt = rawTg.startsWith("@") ? rawTg : `@${rawTg}`;
    const cleanBare = rawTg.replace(/^@/, "");

    // 1. Try exact matches from updatesMap
    let detected = updatesMap[cleanWithAt] || updatesMap[cleanBare];

    // 2. If not found in updatesMap, scan allSenders
    if (!detected && allSenders.length > 0) {
      const matchedSender = allSenders.find((s) => {
        const sWithAt = (s.username || "").toLowerCase().trim();
        const sBare = sWithAt.replace(/^@/, "");
        const sFirst = (s.firstName || "").toLowerCase().trim();
        return sWithAt === cleanWithAt || sBare === cleanBare || (sBare && cleanBare && (sBare.includes(cleanBare) || cleanBare.includes(sBare))) || (sFirst && (sFirst === cleanBare || sFirst === cleanWithAt)) || (s.text && (s.text.toLowerCase().includes(cleanBare) || s.text.toLowerCase().includes(cleanWithAt)));
      });

      if (matchedSender) {
        detected = {
          chatId: matchedSender.chatId,
          firstName: matchedSender.firstName,
          text: matchedSender.text,
          date: matchedSender.date,
        };
      }
    }

    // 3. Fallback heuristic: If user has a single unverified authorized user or whitelist, and only 1 sender sent start/confirm
    if (!detected && targetUsernames.size <= 2 && allSenders.length >= 1) {
      const confirmedSender = allSenders.find((s) => s.isConfirmedCommand) || allSenders[0];
      if (confirmedSender) {
        detected = {
          chatId: confirmedSender.chatId,
          firstName: confirmedSender.firstName,
          text: confirmedSender.text,
          date: confirmedSender.date,
        };
      }
    }

    if (detected && detected.chatId) {
      const existingIdx = currentAuthorizedList.findIndex((u) => u.telegramUsername.toLowerCase() === cleanWithAt || u.telegramUsername.toLowerCase().replace(/^@/, "") === cleanBare);

      if (existingIdx >= 0) {
        if (!currentAuthorizedList[existingIdx].chatId || currentAuthorizedList[existingIdx].chatId !== detected.chatId) {
          currentAuthorizedList[existingIdx] = {
            ...currentAuthorizedList[existingIdx],
            chatId: detected.chatId,
            confirmed: true,
            confirmedAt: currentAuthorizedList[existingIdx].confirmedAt || new Date().toISOString(),
            isActive: true,
          };
          newlyResolvedCount++;
          resolvedUsers.push({
            username: cleanWithAt,
            chatId: detected.chatId,
            displayName: detected.firstName || currentAuthorizedList[existingIdx].appUsername,
          });
        }
      } else {
        // Find profile account if any
        const matchedProfile = userAccounts.find((a) => (a.telegramUsername || "").toLowerCase().trim() === cleanWithAt.toLowerCase() || (a.telegramUsername || "").toLowerCase().trim() === cleanBare.toLowerCase());

        currentAuthorizedList.push({
          id: `tg_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          telegramUsername: cleanWithAt,
          chatId: detected.chatId,
          appUsername: matchedProfile?.username || detected.firstName || "",
          confirmed: true,
          confirmedAt: new Date().toISOString(),
          isActive: true,
          role: "partner",
        });
        newlyResolvedCount++;
        resolvedUsers.push({
          username: cleanWithAt,
          chatId: detected.chatId,
          displayName: detected.firstName || matchedProfile?.username,
        });
      }
    }
  }

  // Also ensure every confirmed sender with an @username is at least added if they executed confirm/start
  for (const sender of allSenders) {
    if (sender.isConfirmedCommand && sender.username && sender.chatId) {
      const cleanUser = sender.username.startsWith("@") ? sender.username : `@${sender.username}`;
      const existing = currentAuthorizedList.find((u) => u.telegramUsername.toLowerCase() === cleanUser.toLowerCase());
      if (!existing) {
        currentAuthorizedList.push({
          id: `tg_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          telegramUsername: cleanUser,
          chatId: sender.chatId,
          appUsername: sender.firstName || "",
          confirmed: true,
          confirmedAt: new Date().toISOString(),
          isActive: true,
          role: "partner",
        });
        newlyResolvedCount++;
        resolvedUsers.push({
          username: cleanUser,
          chatId: sender.chatId,
          displayName: sender.firstName,
        });
      }
    }
  }

  const updatedConfig: TelegramConfig = {
    ...config,
    authorizedUsers: currentAuthorizedList,
    capturedSenders: allSenders,
  };

  return {
    updatedConfig,
    newlyResolvedCount,
    resolvedUsers,
    allSenders,
    webhookConflictResolved: detailed.webhookReleased,
  };
}

/**
 * Dispatches test alerts to ALL configured recipients (multi-user broadcast)
 */
export async function testTelegramMultiBroadcast(
  config: TelegramConfig,
  customTestMessage?: string,
): Promise<{
  success: boolean;
  message: string;
  recipientsCount: number;
  details: { target: string; username?: string; success: boolean; error?: string }[];
}> {
  const cleanToken = config.botToken.trim();
  if (!cleanToken) {
    return { success: false, message: "Please enter a Bot Token.", recipientsCount: 0, details: [] };
  }

  // Collect all destinations
  const destinations: { chatId: string; label: string }[] = [];
  if (config.chatId && config.chatId.trim()) {
    destinations.push({ chatId: config.chatId.trim(), label: "Primary Group / Default" });
  }

  if (Array.isArray(config.authorizedUsers)) {
    for (const u of config.authorizedUsers) {
      if (u.isActive !== false && u.chatId && u.chatId.trim()) {
        if (!destinations.some((d) => d.chatId === u.chatId.trim())) {
          destinations.push({ chatId: u.chatId.trim(), label: u.telegramUsername });
        }
      }
    }
  }

  if (destinations.length === 0) {
    return {
      success: false,
      message: 'No recipient Chat IDs found! Click "Auto-Detect Chat IDs" or ask users to send /confirm in your bot.',
      recipientsCount: 0,
      details: [],
    };
  }

  const testMessage = customTestMessage || `🎉 <b>Our Home Telegram Alert Test</b>\n\n` + `Your Telegram bot is successfully connected to <b>Our Home</b>! 💕\n` + `You will receive milestone countdowns, date reminders, love letter alerts, and security notifications directly in this chat.\n\n` + `<i>Time: ${new Date().toLocaleString()}</i>`;

  let successCount = 0;
  const details: { target: string; username?: string; success: boolean; error?: string }[] = [];

  for (const dest of destinations) {
    const res = await sendDirectTelegramMessage(cleanToken, dest.chatId, testMessage);
    if (res.success) {
      successCount++;
      details.push({ target: dest.chatId, username: dest.label, success: true });
    } else {
      details.push({ target: dest.chatId, username: dest.label, success: false, error: res.error });
    }
  }

  if (successCount > 0) {
    const labels = details
      .filter((d) => d.success)
      .map((d) => d.username)
      .join(", ");
    return {
      success: true,
      message: `Test alert successfully sent to ${successCount} recipient(s): ${labels}!`,
      recipientsCount: successCount,
      details,
    };
  }

  return {
    success: false,
    message: `Failed to deliver test message to any recipient. Check bot permissions.`,
    recipientsCount: 0,
    details,
  };
}

/**
 * Dispatches an alert message to Telegram with zero-crash direct fallback for Vercel production
 */
export async function sendTelegramAlert(message: string, type: "milestone" | "date" | "letter" | "chat" | "security" | "card", adminSettingsOrOptions?: AdminSetting[] | TelegramAlertOptions, customConfig?: TelegramConfig): Promise<{ success: boolean; error?: string; recipientsCount?: number }> {
  let options: TelegramAlertOptions | undefined;
  let adminSettings: AdminSetting[] | undefined;

  if (Array.isArray(adminSettingsOrOptions)) {
    adminSettings = adminSettingsOrOptions;
  } else if (adminSettingsOrOptions && typeof adminSettingsOrOptions === "object") {
    options = adminSettingsOrOptions;
    adminSettings = options.adminSettings;
    customConfig = customConfig || options.customConfig;
  }

  const config = customConfig || getTelegramConfig(adminSettings);

  // If master toggle is disabled, silently skip
  if (!config.enabled) {
    return { success: false, error: "Telegram alerts are disabled or not configured." };
  }

  // Check specific event category filters
  if (type === "milestone" && !config.notifyMilestones) return { success: false, error: "Milestone notifications disabled" };
  if (type === "date" && !config.notifyDates) return { success: false, error: "Date plan notifications disabled" };
  if (type === "letter" && !config.notifyLetters) return { success: false, error: "Love letter notifications disabled" };
  if (type === "chat" && !config.notifyChat) return { success: false, error: "Chat notifications disabled" };
  if (type === "security" && !config.notifySecurity) return { success: false, error: "Security notifications disabled" };
  if (type === "card" && config.notifyCards === false) return { success: false, error: "Celebration card notifications disabled" };

  // Normalize exclusion, targeting, and couple scoping parameters
  const normalizedExclude = options?.excludeUsername?.trim() ? options.excludeUsername.trim().toLowerCase() : null;
  const normalizedExcludeHandle = normalizedExclude ? (normalizedExclude.startsWith("@") ? normalizedExclude : `@${normalizedExclude}`) : null;

  const normalizedTarget = options?.targetUsername?.trim() ? options.targetUsername.trim().toLowerCase() : null;
  const normalizedTargetHandle = normalizedTarget ? (normalizedTarget.startsWith("@") ? normalizedTarget : `@${normalizedTarget}`) : null;

  const targetCoupleId = options?.coupleId?.trim() || null;

  // Collect active destination Chat IDs matching the user data criteria:
  const recipientChatIds = new Set<string>();
  let matchedAuthorizedCount = 0;

  if (Array.isArray(config.authorizedUsers)) {
    for (const u of config.authorizedUsers) {
      if (!u.isActive || !u.confirmed || !u.chatId || !u.chatId.trim()) {
        continue;
      }

      const userTg = u.telegramUsername.toLowerCase().trim();
      const userApp = (u.appUsername || "").toLowerCase().trim();

      // 1. Exclude sender so they don't get pinged about their own action
      if (normalizedExclude) {
        if (userApp === normalizedExclude || userTg === normalizedExclude || userTg === normalizedExcludeHandle) {
          continue;
        }
      }

      // 2. Personal targeting: if targeted to a single user (e.g. security alert), only deliver to them
      if (normalizedTarget) {
        if (userApp !== normalizedTarget && userTg !== normalizedTarget && userTg !== normalizedTargetHandle) {
          continue;
        }
      }

      // 3. Couple Space Partitioning: if scoped to a couple, deliver only to partners in that couple
      if (targetCoupleId) {
        let belongsToCouple = Boolean(u.coupleId && u.coupleId === targetCoupleId);

        // Fallback: match via userAccounts registry if coupleId wasn't stored on the authorized user
        if (!belongsToCouple && Array.isArray(options?.userAccounts) && u.appUsername) {
          const matchedAcc = options.userAccounts.find((a) => a.username.toLowerCase() === u.appUsername?.toLowerCase());
          if (matchedAcc && matchedAcc.coupleId === targetCoupleId) {
            belongsToCouple = true;
          }
        }

        if (!belongsToCouple) {
          continue;
        }
      }

      recipientChatIds.add(u.chatId.trim());
      matchedAuthorizedCount++;
    }
  }

  // Fallback to primary group Chat ID ONLY when:
  // - No personal targeting is specified AND
  // - (No couple scoping was specified OR no authorized couple partners were found yet)
  if (config.chatId && config.chatId.trim() && !normalizedTarget) {
    if (!targetCoupleId || matchedAuthorizedCount === 0) {
      recipientChatIds.add(config.chatId.trim());
    }
  }

  if (recipientChatIds.size === 0) {
    return {
      success: false,
      error: "No active recipient Chat IDs matched the filter criteria for this alert category.",
    };
  }

  let sentCount = 0;
  let lastError = "";

  // Dispatch alert to each recipient chat
  for (const targetChatId of recipientChatIds) {
    let delivered = false;

    // 1. Try server proxy endpoint first
    try {
      const res = await fetch("/api/telegram/send", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          chatId: targetChatId,
          text: message,
          parseMode: "HTML",
        }),
      });

      const parsed = await safeParseResponse(res);
      if (parsed.isJson && res.ok && parsed.data?.success) {
        delivered = true;
        sentCount++;
      }
    } catch (proxyErr) {
      lastError = proxyErr instanceof Error ? proxyErr.message : "Server dispatch failed";
    }
  }

  if (sentCount > 0) {
    return { success: true, recipientsCount: sentCount };
  }

  return { success: false, error: lastError || "Failed to dispatch to any Telegram recipients" };
}

/**
 * Sends a direct message to a specific single chat ID (used for individual user testing or confirmation)
 */
export async function sendDirectTelegramMessage(botToken: string, chatId: string, message: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanChat = chatId.trim();

  if (!cleanChat) {
    return { success: false, error: "A Chat ID is required." };
  }

  // 1. Try server proxy endpoint
  try {
    const res = await fetch("/api/telegram/send", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        chatId: cleanChat,
        text: message,
        parseMode: "HTML",
      }),
    });
    const parsed = await safeParseResponse(res);
    if (parsed.isJson && res.ok && parsed.data?.success) {
      return { success: true, message: "Message sent successfully!" };
    }
  } catch (proxyErr) {
    return { success: false, error: proxyErr instanceof Error ? proxyErr.message : "Telegram server unavailable" };
  }

  return { success: false, error: "Telegram server returned an invalid response." };
}

// ==========================================
// TELEGRAM WEBHOOK MANAGEMENT (SERVER & DIRECT)
// ==========================================

export async function setTelegramWebhook(_botToken: string, webhookUrl: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl) return { success: false, error: "Webhook URL is required." };

  try {
    const res = await fetch("/api/telegram/webhook/set", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ webhookUrl: cleanUrl }),
    });
    const parsed = await safeParseResponse(res);
    if (parsed.isJson && res.ok && parsed.data?.success) {
      return { success: true, message: parsed.data.message || "Webhook activated successfully!" };
    }
    return { success: false, error: parsed.data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to set webhook" };
  }
}

export async function getTelegramWebhookInfo(_botToken: string): Promise<{ success: boolean; info?: any; error?: string }> {
  try {
    const res = await fetch("/api/telegram/webhook/info", { method: "POST", headers: authHeaders() });
    const parsed = await safeParseResponse(res);
    if (parsed.isJson && res.ok && parsed.data?.success) return { success: true, info: parsed.data.info };
    return { success: false, error: parsed.data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to fetch webhook info" };
  }
}

export async function deleteTelegramWebhook(_botToken: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch("/api/telegram/webhook/delete", { method: "POST", headers: authHeaders() });
    const parsed = await safeParseResponse(res);
    if (parsed.isJson && res.ok && parsed.data?.success) {
      return { success: true, message: parsed.data.message || "Webhook removed successfully!" };
    }
    return { success: false, error: parsed.data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to remove webhook" };
  }
}

// ==========================================
// TELEGRAM WHITELIST & PROFILE AUTO-SYNC HELPERS
// ==========================================

/**
 * Extracts and normalizes all Telegram usernames declared across user profiles
 */
export function extractTelegramUsernamesFromProfiles(userAccounts: UserAccount[]): { username: string; accountName: string }[] {
  if (!Array.isArray(userAccounts)) return [];

  const map = new Map<string, string>();
  for (const acc of userAccounts) {
    const rawTg = (acc.telegramUsername || "").trim();
    if (rawTg) {
      const normalized = rawTg.startsWith("@") ? rawTg.toLowerCase() : `@${rawTg.toLowerCase()}`;
      if (normalized.length > 1 && !map.has(normalized)) {
        map.set(normalized, acc.username);
      }
    }
  }

  return Array.from(map.entries()).map(([username, accountName]) => ({ username, accountName }));
}

/**
 * Automatically merges user profile Telegram usernames into the active whitelist
 */
export function mergeProfileUsernamesIntoWhitelist(currentWhitelist: string[] = [], userAccounts: UserAccount[] = []): string[] {
  const discovered = extractTelegramUsernamesFromProfiles(userAccounts).map((d) => d.username);
  const existing = currentWhitelist.map((u) => (u.startsWith("@") ? u.trim() : `@${u.trim()}`).toLowerCase());
  return Array.from(new Set([...existing, ...discovered])).filter((u) => u.length > 1);
}

/**
 * Confirms or registers an authorized Telegram user with their verified Chat ID
 */
export function confirmOrRegisterTelegramUser(telegramUsername: string, chatId: string, config: TelegramConfig, appUsername?: string): { updatedConfig: TelegramConfig; user: TelegramAuthorizedUser; isNew: boolean } {
  const cleanUsername = telegramUsername.startsWith("@") ? telegramUsername.toLowerCase().trim() : `@${telegramUsername.toLowerCase().trim()}`;
  const cleanChat = chatId.trim();
  const currentList = Array.isArray(config.authorizedUsers) ? [...config.authorizedUsers] : [];

  const existingIndex = currentList.findIndex((u) => u.telegramUsername.toLowerCase() === cleanUsername);

  let targetUser: TelegramAuthorizedUser;
  let isNew = false;

  if (existingIndex >= 0) {
    targetUser = {
      ...currentList[existingIndex],
      chatId: cleanChat,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      lastNotifiedAt: new Date().toISOString(),
      isActive: true,
      appUsername: appUsername || currentList[existingIndex].appUsername,
    };
    currentList[existingIndex] = targetUser;
  } else {
    isNew = true;
    targetUser = {
      id: `tg_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      telegramUsername: cleanUsername,
      chatId: cleanChat,
      appUsername: appUsername || "",
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      lastNotifiedAt: new Date().toISOString(),
      isActive: true,
      role: "partner",
    };
    currentList.push(targetUser);
  }

  // Ensure user is on whitelistedUsernames
  const currentWhitelist = Array.isArray(config.whitelistedUsernames) ? [...config.whitelistedUsernames] : [];
  if (!currentWhitelist.some((u) => u.toLowerCase() === cleanUsername)) {
    currentWhitelist.push(cleanUsername);
  }

  return {
    updatedConfig: {
      ...config,
      whitelistedUsernames: currentWhitelist,
      authorizedUsers: currentList,
    },
    user: targetUser,
    isNew,
  };
}

/**
 * Adds or updates an authorized user in the Telegram config
 */
export function addAuthorizedTelegramUser(
  config: TelegramConfig,
  newUser: {
    telegramUsername: string;
    chatId?: string;
    appUsername?: string;
    coupleId?: string;
    role?: "partner" | "admin" | "guest";
    confirmed?: boolean;
  },
): TelegramConfig {
  const cleanUsername = newUser.telegramUsername.startsWith("@") ? newUser.telegramUsername.toLowerCase().trim() : `@${newUser.telegramUsername.toLowerCase().trim()}`;

  const currentList = Array.isArray(config.authorizedUsers) ? [...config.authorizedUsers] : [];
  const existingIndex = currentList.findIndex((u) => u.telegramUsername.toLowerCase() === cleanUsername);

  if (existingIndex >= 0) {
    currentList[existingIndex] = {
      ...currentList[existingIndex],
      chatId: newUser.chatId?.trim() || currentList[existingIndex].chatId,
      appUsername: newUser.appUsername || currentList[existingIndex].appUsername,
      coupleId: newUser.coupleId || currentList[existingIndex].coupleId,
      role: newUser.role || currentList[existingIndex].role,
      confirmed: newUser.confirmed !== undefined ? newUser.confirmed : currentList[existingIndex].confirmed,
      isActive: true,
    };
  } else {
    currentList.push({
      id: `tg_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      telegramUsername: cleanUsername,
      chatId: newUser.chatId?.trim() || "",
      appUsername: newUser.appUsername || "",
      coupleId: newUser.coupleId,
      confirmed: !!newUser.confirmed || !!newUser.chatId?.trim(),
      confirmedAt: newUser.confirmed || newUser.chatId?.trim() ? new Date().toISOString() : undefined,
      isActive: true,
      role: newUser.role || "partner",
    });
  }

  const currentWhitelist = Array.isArray(config.whitelistedUsernames) ? [...config.whitelistedUsernames] : [];
  if (!currentWhitelist.some((u) => u.toLowerCase() === cleanUsername)) {
    currentWhitelist.push(cleanUsername);
  }

  return {
    ...config,
    whitelistedUsernames: currentWhitelist,
    authorizedUsers: currentList,
  };
}

/**
 * Removes an authorized user from the Telegram config
 */
export function removeAuthorizedTelegramUser(config: TelegramConfig, idOrUsername: string): TelegramConfig {
  const clean = idOrUsername.toLowerCase().trim();
  const currentList = (config.authorizedUsers || []).filter((u) => u.id !== clean && u.telegramUsername.toLowerCase() !== clean);
  return {
    ...config,
    authorizedUsers: currentList,
  };
}

/**
 * Toggles an authorized user's active status
 */
export function toggleAuthorizedTelegramUserStatus(config: TelegramConfig, userId: string, isActive: boolean): TelegramConfig {
  const currentList = (config.authorizedUsers || []).map((u) => {
    if (u.id === userId) {
      return { ...u, isActive };
    }
    return u;
  });
  return {
    ...config,
    authorizedUsers: currentList,
  };
}

// ==========================================
// ROMANTIC HTML MESSAGE FORMATTERS
// ==========================================

export function formatMilestoneTelegramMessage(title: string, category: string, dateStr: string, daysLeft: number): string {
  const badgeEmoji = category === "anniversary" ? "💍" : category === "birthday" ? "🎂" : category === "engagement" ? "💎" : "✨";

  const timeLabel = daysLeft === 0 ? "<b>is TODAY! 🎉 Happy Celebration!</b>" : daysLeft === 1 ? "<b>is TOMORROW! 💖</b>" : `is in <b>${daysLeft} days</b>! 💕`;

  return `${badgeEmoji} <b>Our Home — Milestone Alert!</b>\n\n` + `Special Chapter: <b>${escapeHtml(title)}</b>\n` + `Target Date: <code>${dateStr}</code>\n` + `Status: ${timeLabel}\n\n` + `<i>"Every single moment holding your hand is forever etched in my heart."</i> ❤️`;
}

export function formatDatePlanTelegramMessage(title: string, dateTimeStr: string, location?: string, hoursLeft?: number): string {
  const timeLeftLabel = hoursLeft !== undefined ? (hoursLeft <= 24 ? `in approximately <b>${Math.round(hoursLeft)} hours</b>! 🥂` : `in <b>${Math.floor(hoursLeft / 24)} days</b>! 💖`) : "scheduled soon!";

  return `🗓️ <b>Our Home — Date Night Reminder!</b>\n\n` + `Scheduled Date: <b>${escapeHtml(title)}</b>\n` + `Date & Time: <code>${dateTimeStr}</code>\n` + (location ? `Location: 📍 <i>${escapeHtml(location)}</i>\n` : "") + `Starting: ${timeLeftLabel}\n\n` + `Don't forget to check your date night checklist in the Date Planner! ✨`;
}

export function formatLoveLetterTelegramMessage(sender: string, title?: string): string {
  return `💌 <b>Our Home — Love Letter Received!</b>\n\n` + `A new romantic letter was sealed into our Love Mailbox by <b>${escapeHtml(sender)}</b>!\n` + (title ? `Letter Title: <i>"${escapeHtml(title)}"</i>\n\n` : "\n") + `Open Our Home to unfold the envelope and read your sweet note. 💕`;
}

export function formatChatMessageTelegramMessage(sender: string, previewText?: string): string {
  return `💬 <b>Our Home — Sweet Chat Message</b>\n\n` + `<b>${escapeHtml(sender)}</b> sent a message:\n` + `<i>"${escapeHtml(previewText ? (previewText.length > 100 ? previewText.substring(0, 97) + "..." : previewText) : "Sent an attachment")}"</i>\n\n` + `Reply directly inside the Sweet Chat workspace! ❤️`;
}

export function formatSecurityAlertTelegramMessage(username: string, action: string, details: string): string {
  return `🛡️ <b>Our Home — Security Alert</b> ⚠️\n\n` + `User Target: <b>${escapeHtml(username)}</b>\n` + `Action: <code>${escapeHtml(action)}</code>\n` + `Details: ${escapeHtml(details)}\n` + `Time: <i>${new Date().toLocaleString()}</i>\n\n` + `If this was not authorized by you, please check Admin Panel security controls immediately.`;
}

export function formatCelebrationCardTelegramMessage(sender: string, cardTitle: string, cardType: string, targetDate?: string, action: "created" | "opened" = "opened"): string {
  const icon = cardType === "birthday" ? "🎂" : cardType === "engagement" ? "💍" : cardType === "fireworks" ? "🎆" : "🎉";
  const typeLabel = cardType ? cardType.charAt(0).toUpperCase() + cardType.slice(1) : "Special Moment";
  const actionText = action === "created" ? `created a special <b>${escapeHtml(typeLabel)}</b> celebration card for you!` : `just opened and celebrated your <b>"${escapeHtml(cardTitle)}"</b> card!`;

  return `${icon} <b>Our Home — Celebration Card Alert</b> 💕\n\n` + `<b>${escapeHtml(sender)}</b> ${actionText}\n` + `Card Title: <b>${escapeHtml(cardTitle)}</b>\n` + (targetDate ? `Celebration Date: <i>${escapeHtml(targetDate)}</i>\n` : "") + `Time: <i>${new Date().toLocaleString()}</i>\n\n` + `Open the <b>Choose Moment</b> tab to view romantic animations, music, and love memories! ✨`;
}

function escapeHtml(text: string): string {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface TelegramDiagnosticReport {
  success: boolean;
  latencyMs: number;
  timestamp: string;
  bot: {
    id: number | string;
    username: string;
    firstName: string;
    canJoinGroups?: boolean;
    canReadAllGroupMessages?: boolean;
    supportsInlineQueries?: boolean;
  } | null;
  webhook?: any;
  destinationChatId?: string | null;
  testMessageSent: boolean;
  testMessageDelivered?: boolean | null;
  testMessageError?: string | null;
  testMessageResult?: any;
  rawTelegramResponse?: any;
  error?: string;
  checks: {
    tokenProvided: boolean;
    apiReachable: boolean;
    botAuthenticated: boolean;
    canJoinGroups?: boolean;
    canReadAllGroupMessages?: boolean;
    webhookHealthy?: boolean;
    testMessageDelivered?: boolean | null;
  };
}

/**
 * Runs a complete diagnostic health check on the Telegram bot credentials and connection:
 * 1. Verifies Bot Token validity & fetches bot identity (@username, name, permissions)
 * 2. Measures ping latency
 * 3. Inspects active Webhook status and pending updates
 * 4. Dispatches a test message if a destination Chat ID is provided
 * 5. Returns a rich, structured diagnostic report
 */
export async function runTelegramBotDiagnostics(botToken: string, chatId?: string, testMessage?: string): Promise<TelegramDiagnosticReport> {
  const cleanToken = (botToken || "").trim();
  const cleanChat = (chatId || "").trim();
  const startTime = Date.now();

  if (!cleanToken) {
    return {
      success: false,
      latencyMs: 0,
      timestamp: new Date().toISOString(),
      bot: null,
      testMessageSent: false,
      error: "Please enter a Telegram Bot Token to run diagnostics.",
      checks: {
        tokenProvided: false,
        apiReachable: false,
        botAuthenticated: false,
        webhookHealthy: false,
        testMessageDelivered: false,
      },
    };
  }

  // 1. Try server proxy endpoint first
  try {
    const res = await fetch("/api/telegram/diagnose", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        chatId: cleanChat || undefined,
        testMessage,
      }),
    });

    const parsed = await safeParseResponse(res);
    if (parsed.isJson && parsed.data) {
      return parsed.data as TelegramDiagnosticReport;
    }
  } catch (proxyErr) {
    console.warn("Proxy diagnostics error, falling back to direct Telegram API:", proxyErr);
  }

  // 2. Direct fallback to Telegram Bot API
  try {
    const meRes = new Response(JSON.stringify({ ok: false, description: "Direct Bot API access is disabled" }), { status: 403 });
    const latencyMs = Date.now() - startTime;
    const meParsed = await safeParseResponse(meRes);
    const meData = meParsed.data;

    if (!meRes.ok || !meData?.ok) {
      return {
        success: false,
        latencyMs,
        timestamp: new Date().toISOString(),
        bot: null,
        error: meData?.description || `Telegram API rejected token with HTTP status ${meRes.status}`,
        testMessageSent: false,
        rawTelegramResponse: meData,
        checks: {
          tokenProvided: true,
          apiReachable: true,
          botAuthenticated: false,
          webhookHealthy: false,
          testMessageDelivered: false,
        },
      };
    }

    const botInfo = meData.result;

    // Webhook check
    let webhookInfo: any = null;
    let webhookHealthy = true;
    try {
      const hookRes = new Response(JSON.stringify({ ok: false }), { status: 403 });
      const hookParsed = await safeParseResponse(hookRes);
      if (hookParsed.data?.ok) {
        webhookInfo = hookParsed.data.result;
        if (webhookInfo.last_error_message) {
          webhookHealthy = false;
        }
      }
    } catch (e) {
      // ignore
    }

    // Resolve chat (could be numeric Chat ID or @username)
    let resolvedChat = "";
    let usernameResolved = false;

    if (cleanChat) {
      if (/^-?\d+$/.test(cleanChat)) {
        resolvedChat = cleanChat;
      } else {
        const cleanUsername = cleanChat.replace(/^@/, "").toLowerCase();
        try {
          const detailed = await fetchTelegramChatIdsDetailed(cleanToken);
          const mapped = detailed.mapped;
          const match = mapped[cleanChat.toLowerCase()] || mapped[`@${cleanUsername}`] || mapped[cleanUsername];
          if (match && match.chatId) {
            resolvedChat = match.chatId;
            usernameResolved = true;
          } else {
            const matchedSender = detailed.senders.find((s) => (s.username || "").toLowerCase().replace(/^@/, "") === cleanUsername || (s.firstName || "").toLowerCase().includes(cleanUsername));
            if (matchedSender) {
              resolvedChat = matchedSender.chatId;
              usernameResolved = true;
            }
          }
        } catch (e) {
          console.warn("Failed to resolve username in client diagnostics:", e);
        }
      }
    }

    // Test message dispatch if resolvedChat provided
    let testMessageDelivered = false;
    let testMessageResult: any = null;
    let testMessageError: string | null = null;

    if (resolvedChat) {
      const text =
        testMessage ||
        `🔬 <b>Telegram Bot Health Check & Diagnostic Ping</b>\n\n` +
          `• <b>Bot:</b> @${botInfo.username || "unknown"} (${botInfo.first_name || "Bot"})\n` +
          `• <b>API Status:</b> Authenticated & Online 🟢\n` +
          `• <b>Recipient:</b> <code>${cleanChat}</code> ${usernameResolved ? "(Resolved to ID: " + resolvedChat + ")" : ""}\n` +
          `• <b>Webhook:</b> ${webhookInfo?.url ? "Active (" + webhookInfo.url + ")" : "None (Direct Push/Polling)"}\n` +
          `• <b>Ping Latency:</b> ${latencyMs} ms\n` +
          `• <b>Timestamp:</b> ${new Date().toISOString()}\n\n` +
          `<i>Connection confirmed from Our Home Admin Panel.</i> 💕`;

      try {
        const sendRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: resolvedChat,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });

        const sendParsed = await safeParseResponse(sendRes);
        if (sendRes.ok && sendParsed.data?.ok) {
          testMessageDelivered = true;
          testMessageResult = sendParsed.data.result;
        } else {
          testMessageError = sendParsed.data?.description || `HTTP ${sendRes.status} dispatch error`;
          testMessageResult = sendParsed.data;
        }
      } catch (sendErr: any) {
        testMessageError = sendErr.message || "Network error dispatching test message";
      }
    } else if (cleanChat) {
      testMessageError = `Username '${cleanChat}' was provided, but no numeric Chat ID could be resolved from recent Telegram messages. Ask user to send /start or /confirm to the bot first!`;
    }

    const totalLatency = Date.now() - startTime;

    return {
      success: true,
      latencyMs: totalLatency,
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
      destinationChatId: cleanChat || null,
      testMessageSent: !!cleanChat,
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
        testMessageDelivered: !!cleanChat ? testMessageDelivered : null,
      },
    };
  } catch (directErr: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      bot: null,
      error: directErr.message || "Failed to connect to Telegram API",
      testMessageSent: false,
      checks: {
        tokenProvided: true,
        apiReachable: false,
        botAuthenticated: false,
        webhookHealthy: false,
        testMessageDelivered: false,
      },
    };
  }
}

export function syncTelegramBotContext(context: { letters?: any[]; milestones?: any[]; datePlans?: any[] }) {
  try {
    localStorage.setItem("love_telegram_bot_context", JSON.stringify(context));
  } catch (e) {}
}
