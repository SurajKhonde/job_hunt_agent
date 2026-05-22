/**
 * In-memory registry of background search jobs (for the polling pattern).
 *
 * The app runs as a long-lived Node process (next dev / next start), so a
 * module-level Map persists across requests. start.js creates a job and runs
 * the search WITHOUT awaiting; status.js reads progress until it's done.
 *
 * Jobs self-expire after 30 min so the map can't grow forever.
 */

const jobs = new Map();
const JOB_TTL = 30 * 60 * 1000;

function createJob() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(id, {
    id,
    status: 'running', // running | done | error
    progress: 'Starting…',
    result: null,
    error: null,
    createdAt: Date.now(),
  });
  return id;
}

function update(id, patch) {
  const job = jobs.get(id);
  if (job) jobs.set(id, { ...job, ...patch });
}

function get(id) {
  // opportunistic cleanup
  const now = Date.now();
  for (const [k, v] of jobs) if (now - v.createdAt > JOB_TTL) jobs.delete(k);
  return jobs.get(id) || null;
}

module.exports = { createJob, update, get };
