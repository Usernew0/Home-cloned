import { twoFactor } from "../../server/handlers.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  return twoFactor(req, res);
}
