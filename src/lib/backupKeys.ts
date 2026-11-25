/** Key columns of each exported table (from the schema files). Used for stable paging and for the restore script's row matching. Default: id.
 *  deleted_rows_backup has NO id column and no unique constraint: it is matched on (src_table, row_id). */
export const TABLE_KEYS: Record<string, string[]> = { couple_tenants: ["couple_id"], membership_ops: ["tx_id"], telegram_sent: ["key"], deleted_rows_backup: ["src_table", "row_id"] };
export const keysOf = (t: string): string[] => TABLE_KEYS[t] || ["id"];
/** Tables whose key is a serial sequence: after a restore the sequence must move past the restored ids. */
export const SERIAL_TABLES: Record<string, string> = { item_shares: "id" };

/** The only Supabase tables the panel reads or restores. */
export const BACKUP_TABLES = [
  "user_accounts", "profiles", "admin_settings", "couple_tenants", "memories", "date_plans", "milestones", "letters", "couple_questions",
  "activity_logs", "celebration_cards", "chat_messages", "item_shares", "membership_config", "membership_ops", "telegram_sent", "deleted_rows_backup",
] as const;
