import { generateDate } from "../server/generateDate.js";
import { withRole, MEMBERS } from "../server/guards.js";

export default withRole(MEMBERS, async (req: any, res: any) => {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  return generateDate(req, res);
});
