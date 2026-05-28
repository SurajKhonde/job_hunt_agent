import { createJob } from '../../../lib/jobs';
import { runSearchJob } from '../../../lib/engine';
import { runDirectoryJob } from '../../../lib/directory';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const jobId = createJob();

  // Fire and forget — long search runs in background; frontend polls /status.
  // mode 'directory' = services-company outreach list; otherwise job-posting search.
  if (body.mode === 'directory') {
    runDirectoryJob(jobId, body);
  } else {
    runSearchJob(jobId, body);
  }

  res.status(202).json({ jobId });
}
