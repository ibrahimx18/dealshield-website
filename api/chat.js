// DealShield Chat Proxy — Vercel Serverless Function
// Routes chat requests from the website (HTTPS) to the WhatsApp bot (HTTP)
// This avoids the "mixed content" browser block.

const BOT_URL = "http://15.204.248.160:5000";

export default async function handler(req, res) {
  // CORS — allow the Vercel site itself
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { phone, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message required" });
    }

    const botRes = await fetch(BOT_URL + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone || "+234****0000",
        message,
      }),
    });

    const data = await botRes.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("Chat proxy error:", err.message);
    return res.status(502).json({
      error: "Bot unreachable",
      reply: "⚠️ Sorry, the chat service is temporarily unavailable. Please try again later.",
    });
  }
}
