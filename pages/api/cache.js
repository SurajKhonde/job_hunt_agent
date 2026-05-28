import { jobsStore, directoryStore } from '../../lib/store';

// ?type=jobs (default) | directory  — pick which store to view/clear.
function pick(type) {
  return type === 'directory' ? directoryStore : jobsStore;
}

export default function handler(req, res) {
  const type = req.query.type === 'directory' ? 'directory' : 'jobs';
  const store = pick(type);

  if (req.method === 'GET') {
    return res.status(200).json({
      jobs: store.getFresh(),
      ttlDays: store.ttlDays,
      type,
    });
  }
  if (req.method === 'DELETE') {
    store.clear();
    return res.status(200).json({ ok: true, type });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
