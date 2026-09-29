export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  return res.status(503).json({ error: 'Chat is temporarily unavailable while a secure, isolated support integration is configured.' });
}
