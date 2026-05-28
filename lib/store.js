/**
 * Disk-backed result stores — now TWO separate ones, because the two kinds of
 * data age very differently:
 *
 *   • JOBS store      → .cache/jobs.json      → 3-day TTL  (postings expire fast)
 *   • DIRECTORY store → .cache/directory.json → 30-day TTL (services companies
 *                                                 are stable for years; no point
 *                                                 paying tokens to re-find them)
 *
 * Each store: saves results with first/last-seen timestamps, prunes on read past
 * its TTL, powers dedup via getSeen(), and re-serves saved rows free via getFresh().
 * Plain fs + JSON — no DB, survives restarts, fine for one user.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), '.cache');

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

// Stable key for a record: normalized apply/website URL, else company|role.
function jobKey(job) {
  const url = (job.applyUrl || job.website || '')
    .trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (url) return url;
  return `${(job.company || '').toLowerCase().trim()}|${(job.role || '').toLowerCase().trim()}`;
}

/**
 * Build a store bound to a file + TTL.
 * @param {string} name   filename stem, e.g. 'jobs' -> .cache/jobs.json
 * @param {number} ttlDays days before a record is pruned
 */
function createStore(name, ttlDays) {
  const FILE = path.join(DIR, `${name}.json`);
  const TTL_MS = ttlDays * 24 * 60 * 60 * 1000;

  function read() {
    ensureDir();
    let data;
    try {
      data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      data = { items: {} };
    }
    if (!data.items) data.items = {};
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(data.items)) {
      if (now - (v.lastSeen || 0) > TTL_MS) {
        delete data.items[k];
        changed = true;
      }
    }
    if (changed) write(data);
    return data;
  }

  function write(data) {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify(data));
  }

  function getSeen() {
    const data = read();
    const keys = new Set(Object.keys(data.items));
    const companies = [
      ...new Set(Object.values(data.items).map((j) => j.company).filter(Boolean)),
    ];
    return { keys, companies };
  }

  function add(records) {
    const data = read();
    const now = Date.now();
    for (const rec of records) {
      const k = jobKey(rec);
      if (data.items[k]) {
        data.items[k] = { ...data.items[k], ...rec, lastSeen: now };
      } else {
        data.items[k] = { ...rec, firstSeen: now, lastSeen: now };
      }
    }
    write(data);
  }

  function getFresh() {
    const data = read();
    return Object.values(data.items).sort(
      (a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0)
    );
  }

  function clear() {
    write({ items: {} });
  }

  return { getSeen, add, getFresh, clear, ttlDays };
}

// The two concrete stores.
const jobsStore = createStore('jobs', 3);
const directoryStore = createStore('directory', 30);

module.exports = { jobKey, createStore, jobsStore, directoryStore };
