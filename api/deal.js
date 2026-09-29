export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ error: 'This demonstration endpoint is retired. Sign in and use the authenticated listing and escrow flows. No funds have been locked.' });
}
