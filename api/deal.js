// Simple mock DealShield deal creation endpoint
// In production this would interact with the backend escrow service.

const { randomUUID: uuidv4 } = require('crypto');
const fs = require('fs');
const path = require('path');

// Store deals in a temporary JSON file (not persistent across redeploys)
const DEALS_FILE = path.join('/tmp', 'dealshield_deals.json');
function loadDeals() {
  try { return JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8')); } catch (_) { return []; }
}
function saveDeal(deal) {
  const deals = loadDeals();
  deals.push(deal);
  fs.writeFileSync(DEALS_FILE, JSON.stringify(deals, null, 2));
}

export default async function handler(req, res) {
  // CORS headers similar to chat endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { counterparty, title, category, amount, inspection_hours, terms, fee } = req.body;
    if (!counterparty || !category || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const deal = {
      deal_id: uuidv4(),
      counterparty,
      title: title || '',
      category,
      amount,
      inspection_hours,
      terms: terms || '',
      fee: Number(fee) || 0,
      status: 'locked',
      created_at: new Date().toISOString()
    };
    // Simulate fund lock – in real implementation this would trigger a bank transfer.
    saveDeal(deal);
    return res.status(201).json({ deal_id: deal.deal_id, status: deal.status });
  } catch (err) {
    console.error('Deal API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
