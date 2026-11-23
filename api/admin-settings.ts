import { adminSettingsGet, adminSettingsPost } from "../server/handlers.js";

export default async function handler(req: any, res: any) {
  if (req.method === "GET") return adminSettingsGet(req, res);
  if (req.method === "POST") return adminSettingsPost(req, res);
  return res.status(405).json({ success: false, error: "Method not allowed" });
}
