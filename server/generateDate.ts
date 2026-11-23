import { GoogleGenAI, Type } from "@google/genai";

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "", httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  return client;
}

export async function generateDate(req: any, res: any) {
  try {
    const { budget, mood, location, duration, occasion } = req.body || {};

    const prompt = `Design a romantic, memorable, and creative date night itinerary for a couple.
Occasion: ${occasion || "Romantic Date"}
Budget: ${budget || "Flexible"}
Mood/Vibe: ${mood || "Cozy & Romantic"}
Location/Setting: ${location || "Local city"}
Duration: ${duration || "Evening (3-4 hours)"}

Return a structured JSON object containing:
- "title": a captivating date title
- "category": one of ["dinner", "adventure", "home", "budget", "other"]
- "description": a warm 2-3 sentence overview of why this date is special
- "theme": a 2-4 word aesthetic theme
- "cost": one of ["Free", "$", "$$", "$$$"]
- "checklist": an array of 4-6 step-by-step checklist items with "id" and "text"
- "notes": romantic advice or secret tips for making it unforgettable`;

    if (process.env.GEMINI_API_KEY) {
      const response = await getClient().models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              description: { type: Type.STRING },
              theme: { type: Type.STRING },
              cost: { type: Type.STRING },
              checklist: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING },
                  },
                  required: ["id", "text"],
                },
              },
              notes: { type: Type.STRING },
            },
            required: ["title", "category", "description", "checklist"],
          },
        },
      });

      const data = JSON.parse(response.text || "{}");
      return res.json({ success: true, plan: data });
    } else {
      // Fallback structured date plan generator if GEMINI_API_KEY is not set yet
      const fallbackPlan = {
        title: `${mood || "Romantic"} Candlelight ${occasion || "Evening"}`,
        category: budget === "Free" || budget === "$" ? "home" : "dinner",
        description: `An intimate, handcrafted ${mood?.toLowerCase() || "romantic"} experience curated specifically for your setting at ${location || "home"}. Enjoy quality uninterrupted time together.`,
        theme: `${mood || "Cozy"} Elegance`,
        cost: budget || "$$",
        checklist: [
          { id: "1", text: "Set up soft background acoustic music & warm ambient lighting" },
          { id: "2", text: `Prepare a special ${budget === "Free" ? "homemade treat" : "dinner reservation"}` },
          { id: "3", text: "Put away mobile phones in a memory box for complete focus" },
          { id: "4", text: "Exchange a surprise written Love Note or memory card" },
        ],
        notes: "Pro Tip: Take a candid photo during dinner to save in your Memory Vault Scrapbook!",
      };
      return res.json({ success: true, plan: fallbackPlan, isFallback: true });
    }
  } catch (err: any) {
    console.error("Error generating AI date itinerary:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to generate date plan" });
  }
}
