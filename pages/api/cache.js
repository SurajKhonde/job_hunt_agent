import { getFresh, clear, TTL_MS } from '../../lib/store';

export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      jobs: getFresh(),
      ttlDays: Math.round(TTL_MS / 86400000),
    });
  }
  if (req.method === 'DELETE') {
    clear();
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
