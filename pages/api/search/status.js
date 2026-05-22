import { get } from '../../../lib/jobs';

export default function handler(req, res) {
  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ error: 'jobId required' });

  const job = get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or expired' });

  res.status(200).json({
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
  });
}
