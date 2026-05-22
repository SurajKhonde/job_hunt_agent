/**
 * The background search runner.
 *
 * runSearchJob(jobId, params):
 *   1. Reads already-seen jobs (last 3 days) and tells Claude to EXCLUDE them.
 *   2. Searches the live web (LinkedIn, Cutshort, Glassdoor, Lever, Greenhouse,
 *      career pages) for RECENT openings (<= ~1 week old), ranked by resume fit.
 *   3. Filters out stale postings + duplicates of what we've already seen.
 *   4. Verifies apply URLs are live, attaches 3 LinkedIn outreach links.
 *   5. Saves new jobs to the 3-day cache and reports counts.
 * Progress is written to the job registry so the frontend can poll it.
 */

const { verifyUrl } = require('./verify');
const { linkedinContacts } = require('./linkedin');
const { getSeen, addJobs, jobKey } = require('./store');
const jobsRegistry = require('./jobs');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

async function runSearchJob(jobId, params) {
  const {
    resumeText = '',
    skills = [],
    role = 'Full Stack / Backend Node.js Developer',
    location = 'Bangalore or remote-India',
    years = '3-4',
    count = 20,
    recencyDays = 7,
    maxSearches = 12,
  } = params || {};

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing in .env.local');

    const { keys: seenKeys, companies: seenCompanies } = getSeen();

    jobsRegistry.update(jobId, { progress: 'Searching every source…' });

    const skillLine = Array.isArray(skills) ? skills.join(', ') : String(skills);
    // Cap the exclude list in the prompt to keep tokens sane; full set filters after.
    const excludeList = seenCompanies.slice(0, 80).join(', ');

    const prompt = `You are an expert job-hunting researcher. Find RECENT, REAL openings and rank by fit.

CANDIDATE
- Role wanted: ${role}
- Experience: ${years} years
- Location: ${location}
- Key skills: ${skillLine}
${resumeText ? `- Resume (use for accurate scoring):\n${resumeText.slice(0, 2500)}` : ''}

WHERE TO SEARCH (cast a wide net — use ALL):
LinkedIn Jobs, Cutshort, Wellfound, Instahyre, Glassdoor, Foundit, Lever (jobs.lever.co),
Greenhouse (boards.greenhouse.io), and individual company career pages.

FRESHNESS (critical): only include postings made within the last ${recencyDays} days.
Skip anything older than that. Capture the posting date for every item.

EXCLUDE (already seen — do NOT return these companies again):
${excludeList || '(none yet)'}

FOR EACH opening capture: company, role, location, source, direct apply URL, posting date,
salary (if shown), required skills. Score matchPercentage (0-100) honestly vs the candidate's
skills + seniority (a senior/lead role needing 8+ yrs scores LOW even if the stack matches).
Skip staffing-agency spam and reposts. Find about ${count}.

Reply with ONLY a JSON array, best-match first, each item:
{"company":"","role":"","location":"","source":"","applyUrl":"","postedDate":"","salary":"",
 "requiredSkills":[],"matchedSkills":[],"missingSkills":[],"matchPercentage":0,"note":""}
Only include items with a real apply URL and a posting date within ${recencyDays} days.`;

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }],
      }),
    });

    if (!apiRes.ok) {
      const t = await apiRes.text();
      throw new Error(`Claude API ${apiRes.status}: ${t.slice(0, 200)}`);
    }

    const data = await apiRes.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    let jobs = parseJsonArray(text);
    const foundRaw = jobs.length;

    // Freshness filter (defensive — prompt already asks, we double-check).
    jobs = jobs.filter((j) => isFresh(j.postedDate, recencyDays + 1));
    const afterFresh = jobs.length;

    // Dedup against the 3-day cache.
    jobs = jobs.filter((j) => !seenKeys.has(jobKey(j)));
    const excluded = afterFresh - jobs.length;

    jobsRegistry.update(jobId, { progress: 'Verifying apply links…' });

    // Verify URLs live (bounded concurrency), drop dead/hallucinated links.
    jobs = await mapLimit(jobs, 6, async (j) => ({ ...j, linkLive: await verifyUrl(j.applyUrl) }));
    jobs = jobs.filter((j) => j.linkLive && j.company);

    // Attach outreach links + sort.
    const results = jobs
      .map((j) => ({ ...j, linkedin: linkedinContacts(j.company) }))
      .sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));

    // Save new ones to the 3-day cache.
    addJobs(results);

    const usage = data.usage || {};
    jobsRegistry.update(jobId, {
      status: 'done',
      progress: 'Done',
      result: {
        jobs: results,
        meta: {
          foundRaw,
          afterFresh,
          excludedAlreadySeen: excluded,
          verifiedLive: results.length,
          webSearches: usage.server_tool_use?.web_search_requests || 0,
          outputTokens: usage.output_tokens || 0,
          rawIfEmpty: results.length === 0 ? text.slice(0, 1200) : undefined,
        },
      },
    });
  } catch (err) {
    jobsRegistry.update(jobId, { status: 'error', error: err.message || 'Search failed' });
  }
}

// ---- helpers ----

function parseJsonArray(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try {
      const v = JSON.parse(m[0]);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
}

// Returns true if the posting looks within `maxDays`. Unknown/blank dates are
// kept (can't verify) — the prompt already enforces freshness upstream.
function isFresh(postedDate, maxDays) {
  if (!postedDate) return true;
  const s = String(postedDate).toLowerCase().trim();
  if (/today|just posted|hours? ago|yesterday|this week/.test(s)) return true;

  const daysAgo = s.match(/(\d+)\s*day/);
  if (daysAgo) return parseInt(daysAgo[1], 10) <= maxDays;

  const weeksAgo = s.match(/(\d+)\s*week/);
  if (weeksAgo) return parseInt(weeksAgo[1], 10) * 7 <= maxDays;

  const monthsAgo = s.match(/(\d+)\s*month/);
  if (monthsAgo) return false;

  const t = Date.parse(s);
  if (!isNaN(t)) return (Date.now() - t) / 86400000 <= maxDays;

  return true; // unparseable — keep
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { runSearchJob };
