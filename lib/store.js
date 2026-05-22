/**
 * Disk-backed result store.
 *
 *  - Saves every found job to .cache/cache.json with first/last-seen timestamps.
 *  - 3-day TTL: anything older is pruned on read, so the cache stays fresh.
 *  - Powers dedup: getSeen() returns the keys/companies already found, so the
 *    next search can EXCLUDE them and only bring new openings.
 *  - getFresh() lets the UI re-show saved results for free (no tokens).
 *
 * Plain fs + JSON — no DB to install, survives server restarts, fine for one user.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), '.cache');
const FILE = path.join(DIR, 'cache.json');
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ jobs: {} }));
}

function read() {
  ensure();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    data = { jobs: {} };
  }
  if (!data.jobs) data.jobs = {};
  // prune expired
  const now = Date.now();
  let changed = false;
  for (const [k, v] of Object.entries(data.jobs)) {
    if (now - (v.lastSeen || 0) > TTL_MS) {
      delete data.jobs[k];
      changed = true;
    }
  }
  if (changed) write(data);
  return data;
}

function write(data) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(data));
}

// Stable key for a job: normalized apply URL, else company|role.
function jobKey(job) {
  const url = (job.applyUrl || '').trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (url) return url;
  return `${(job.company || '').toLowerCase().trim()}|${(job.role || '').toLowerCase().trim()}`;
}

function getSeen() {
  const data = read();
  const keys = new Set(Object.keys(data.jobs));
  const companies = [...new Set(Object.values(data.jobs).map((j) => j.company).filter(Boolean))];
  return { keys, companies };
}

function addJobs(jobs) {
  const data = read();
  const now = Date.now();
  for (const job of jobs) {
    const k = jobKey(job);
    if (data.jobs[k]) {
      data.jobs[k] = { ...data.jobs[k], ...job, lastSeen: now };
    } else {
      data.jobs[k] = { ...job, firstSeen: now, lastSeen: now };
    }
  }
  write(data);
}

function getFresh() {
  const data = read();
  return Object.values(data.jobs).sort(
    (a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0)
  );
}

function clear() {
  write({ jobs: {} });
}

module.exports = { jobKey, getSeen, addJobs, getFresh, clear, TTL_MS };
