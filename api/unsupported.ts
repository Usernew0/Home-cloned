// Single function (keeps the deployment under Vercel's function-count limit) answering routes that
// only work on the Express server. They fail closed with 501 instead of 404 or fake success.
const FEATURES: Record<string, string> = {
  payments: "Online payments",
  audio: "Audio upload",
  senders: "Telegram sender capture",
  diagnose: "Telegram diagnostics",
  webhook: "Telegram webhook management",
};

export default function handler(req: any, res: any) {
  const key = typeof req.query?.f === "string" ? req.query.f : "";
  const feature = FEATURES[key] || "This feature";
  res.status(501).json({ success: false, error: `${feature} is not available on this deployment` });
}
