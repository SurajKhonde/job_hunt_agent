import { createJob } from '../../../lib/jobs';
import { runSearchJob } from '../../../lib/engine';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const jobId = createJob();

  // Fire and forget — the long search runs in the background; we return now so
  // the browser never waits long enough to time out. Frontend polls /status.
  runSearchJob(jobId, req.body || {});

  res.status(202).json({ jobId });
}
