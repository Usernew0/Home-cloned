import { useState, useEffect, useCallback } from 'react';
import { 
  TelegramConfig, 
  TelegramAuthorizedUser, 
  AdminSetting, 
  UserAccount 
} from '../types';
import { 
  getTelegramConfig, 
  saveTelegramConfig, 
  addAuthorizedTelegramUser 
} from '../lib/telegramService';
import { saveAdminSettingDoc } from '../lib/syncService';

export interface UseTelegramWhitelistSyncOptions {
  telegramUsername?: string;
  appUsername?: string;
  coupleId?: string;
  adminSettings?: AdminSetting[];
  userAccounts?: UserAccount[];
}

export interface UseTelegramWhitelistSyncResult {
  isSyncing: boolean;
  syncStatus: 'idle' | 'synced' | 'pending_chat' | 'error';
  isWhitelisted: boolean;
  isConfirmed: boolean;
  linkedChatId: string | null;
  errorMessage: string | null;
  botUsername: string;
  authorizedUser: TelegramAuthorizedUser | null;
  syncUserToWhitelist: (overrideTelegramUsername?: string) => Promise<{
    success: boolean;
    isConfirmed: boolean;
    chatId?: string;
    message: string;
  }>;
}

/**
 * Custom React Hook for User Profile:
 * Automatically ensures a user's Telegram username is added to the global Admin Panel
 * 'Telegram Whitelist' and 'Authorized Users' registry with coupleId binding,
 * auto-links previously captured Chat IDs from /start or /confirm commands,
 * and maintains real-time synchronization between the User Profile and the Admin Panel.
 */
export function useTelegramWhitelistSync({
  telegramUsername,
  appUsername,
  coupleId,
  adminSettings
}: UseTelegramWhitelistSyncOptions): UseTelegramWhitelistSyncResult {
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compute live Telegram config from AdminSettings / local cache
  const activeConfig = getTelegramConfig(adminSettings);

  const cleanUsername = telegramUsername?.trim()
    ? (telegramUsername.trim().startsWith('@') 
        ? telegramUsername.trim().toLowerCase() 
        : `@${telegramUsername.trim().toLowerCase()}`)
    : '';

  // Extract bot username for link instructions (e.g., @OurHomeBot)
  const botUsername = activeConfig.botToken && activeConfig.botToken.includes(':')
    ? 'our_telegram_bot'
    : 'your_bot';

  // Check if current username is already present in whitelistedUsernames
  const isWhitelisted = cleanUsername 
    ? (activeConfig.whitelistedUsernames || []).some(
        u => u.toLowerCase() === cleanUsername.toLowerCase()
      )
    : false;

  // Find authorized user entry in config
  const authorizedUser = cleanUsername && Array.isArray(activeConfig.authorizedUsers)
    ? activeConfig.authorizedUsers.find(
        u => u.telegramUsername.toLowerCase() === cleanUsername.toLowerCase()
      ) || null
    : null;

  const isConfirmed = Boolean(authorizedUser?.confirmed && authorizedUser?.chatId?.trim());
  const linkedChatId = authorizedUser?.chatId?.trim() || null;

  // Compute overall status
  const syncStatus: 'idle' | 'synced' | 'pending_chat' | 'error' = !cleanUsername
    ? 'idle'
    : isConfirmed
      ? 'synced'
      : isWhitelisted
        ? 'pending_chat'
        : 'idle';

  /**
   * Performs the sync operation:
   * 1. Validates and normalizes the Telegram username.
   * 2. Adds the handle to global Admin Panel whitelistedUsernames.
   * 3. Checks capturedSenders to auto-link Chat ID if the user previously messaged the bot.
   * 4. Upserts the authorizedUsers registry with coupleId and appUsername.
   * 5. Persists directly to Firestore adminSettings collection and localStorage cache.
   */
  const syncUserToWhitelist = useCallback(async (
    overrideTelegramUsername?: string
  ): Promise<{
    success: boolean;
    isConfirmed: boolean;
    chatId?: string;
    message: string;
  }> => {
    const rawUsername = overrideTelegramUsername !== undefined ? overrideTelegramUsername : telegramUsername;
    const targetTg = rawUsername?.trim()
      ? (rawUsername.trim().startsWith('@') 
          ? rawUsername.trim().toLowerCase() 
          : `@${rawUsername.trim().toLowerCase()}`)
      : '';

    if (!targetTg || targetTg.length < 2) {
      return {
        success: false,
        isConfirmed: false,
        message: 'Please enter a valid Telegram username starting with @'
      };
    }

    setIsSyncing(true);
    setErrorMessage(null);

    try {
      const currentConfig = getTelegramConfig(adminSettings);

      // Check captured senders in case user already sent /start or /confirm to the bot
      const rawHandleWithoutAt = targetTg.startsWith('@') ? targetTg.substring(1) : targetTg;
      const matchedSender = (currentConfig.capturedSenders || []).find(s => 
        s.username?.toLowerCase() === rawHandleWithoutAt.toLowerCase() ||
        s.username?.toLowerCase() === targetTg.toLowerCase()
      );

      const resolvedChatId = matchedSender?.chatId || authorizedUser?.chatId || '';
      const isNowConfirmed = Boolean(resolvedChatId && resolvedChatId.trim());

      // Use addAuthorizedTelegramUser to merge handle and update authorizedUsers list
      const updatedConfig = addAuthorizedTelegramUser(currentConfig, {
        telegramUsername: targetTg,
        appUsername: appUsername || '',
        coupleId: coupleId,
        chatId: resolvedChatId,
        confirmed: isNowConfirmed,
        role: 'partner'
      });

      // Persist to database and local cache
      await saveTelegramConfig(updatedConfig, saveAdminSettingDoc);

      setIsSyncing(false);

      if (isNowConfirmed) {
        return {
          success: true,
          isConfirmed: true,
          chatId: resolvedChatId,
          message: `Telegram @${rawHandleWithoutAt} successfully linked & verified with Chat ID ${resolvedChatId}!`
        };
      }

      return {
        success: true,
        isConfirmed: false,
        message: `Telegram @${rawHandleWithoutAt} added to Admin Panel Whitelist! Send /confirm in the Telegram bot to link your chat ID.`
      };
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to sync Telegram username to admin whitelist';
      setErrorMessage(errMsg);
      setIsSyncing(false);
      return {
        success: false,
        isConfirmed: false,
        message: errMsg
      };
    }
  }, [telegramUsername, appUsername, coupleId, adminSettings, authorizedUser]);

  return {
    isSyncing,
    syncStatus,
    isWhitelisted,
    isConfirmed,
    linkedChatId,
    errorMessage,
    botUsername,
    authorizedUser,
    syncUserToWhitelist
  };
}
