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
const { jobsStore, jobKey } = require('./store');
const { passesTargeting } = require('./targeting');
const { isRealCompany } = require('./realness');
const { parseJsonArray } = require('./parse');
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
    maxSearches = 15,
  } = params || {};

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing in .env.local');

    const { keys: seenKeys, companies: seenCompanies } = jobsStore.getSeen();

    jobsRegistry.update(jobId, { progress: 'Searching every source…' });

    const skillLine = Array.isArray(skills) ? skills.join(', ') : String(skills);
    // Cap the exclude list in the prompt to keep tokens sane; full set filters after.
    const excludeList = seenCompanies.slice(0, 80).join(', ');

    const prompt = `You are an expert job-hunting researcher for a practical, ship-focused engineer.
Find specific, individually-NAMED companies that are hiring, and rank by fit.

CANDIDATE
- Role wanted: ${role}
- Experience: ${years} years
- Location: ${location}
- Key skills: ${skillLine}
${resumeText ? `- Resume (use for accurate scoring):\n${resumeText.slice(0, 2500)}` : ''}

CRITICAL OUTPUT RULE — READ TWICE:
Every item MUST be ONE real, specific, named company with its OWN website.
- GOOD: {"company":"BrightLayer Studios","website":"https://brightlayer.io", ...}
- BANNED — never output these: "Multiple companies", "Various startups", "10 listings on
  LinkedIn", "Companies on Glassdoor", "Confirmed via Cutshort", or anything that names a
  job board / search page instead of a company. If you cannot identify the SPECIFIC company
  name AND its website, DROP that result entirely. Fewer real companies is better than
  any aggregate junk.
To get real names: open/inspect the actual job postings (not just the search-results page),
or use sources where the company is explicit (company career pages, Lever jobs.lever.co/COMPANY,
Greenhouse boards.greenhouse.io/COMPANY).

WHO TO TARGET (the whole point):
- Mid-size startups (~Series A/B, ~30–500 people), software studios, service/product-dev
  companies, and lesser-known PRODUCT companies that hire on practical skill (build/ship
  rounds), NOT leetcode/DSA-gatekept.

WHO TO AVOID (never return):
- Famous unicorns / high-competition startups (Meesho, Razorpay, CRED, Swiggy, Zomato,
  PhonePe, Flipkart, Groww, Zerodha, …), big MNCs / FAANG-India, mass IT-services giants
  (TCS, Infosys, Wipro, Accenture, Cognizant, …), and any CONTRACT/C2H/C2C/staffing role.
  FULL-TIME only.

WHERE TO LOOK: LinkedIn Jobs, Cutshort, Wellfound, Instahyre, Foundit, Lever, Greenhouse,
and company career pages. Prefer Full Stack and Backend (Node.js / Next.js) titles.

FRESHNESS: only postings within the last ${recencyDays} days. Capture the posting date.

EXCLUDE (already seen — do NOT return again):
${excludeList || '(none yet)'}

For each real company capture: company (the real name), website (its own domain), role,
location, source, direct apply URL, posting date, required skills. Score matchPercentage
(0-100) honestly vs the candidate's skills + seniority. In "note" say WHY it fits.

IMPORTANT: include a job even if you're not 100% sure the apply link is perfect — give your
best direct URL. Do NOT drop real, specific job posts just because the link might be
imperfect. The user will decide what to apply to. Aim for as many REAL, specific posts as
you can find (target ${count}+). Prefer individual named-company postings.

You MAY ALSO include aggregate/listing pages (e.g. a Cutshort or LinkedIn search-results page
with many roles) — put these as items where "company" starts with the site name, e.g.
"company":"LinkedIn — Node.js Bangalore listings". We show those separately so the user can
browse them. Always include the real URL in applyUrl.

Reply with ONLY a JSON array, best-match first, each item:
{"company":"","website":"","role":"","location":"","source":"","applyUrl":"","postedDate":"",
 "requiredSkills":[],"matchedSkills":[],"missingSkills":[],"matchPercentage":0,"note":""}`;

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
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

    // Split into REAL named jobs vs AGGREGATE entries ("100 jobs on Cutshort").
    // We no longer throw the aggregates away — we show them in a separate
    // "browse these listing pages yourself" section at the bottom.
    const aggregates = jobs
      .filter((j) => !isRealCompany(j))
      .map((j) => ({
        label: j.company || j.role || 'Job listing page',
        source: j.source || guessSource(j.applyUrl),
        url: j.applyUrl || j.website || '',
      }))
      .filter((a) => /^https?:\/\//i.test(a.url));
    const excludedJunk = aggregates.length;

    jobs = jobs.filter((j) => isRealCompany(j));

    // Targeting: now ONLY drops contract/staffing roles (big cos are kept).
    jobs = jobs.filter((j) => passesTargeting(j));
    const excludedByTargeting = foundRaw - excludedJunk - jobs.length;

    // Dedup against the 3-day cache.
    const beforeDedup = jobs.length;
    jobs = jobs.filter((j) => !seenKeys.has(jobKey(j)));
    const excluded = beforeDedup - jobs.length;

    jobsRegistry.update(jobId, { progress: 'Checking links…' });

    // Verify links — but DO NOT DELETE. Just LABEL each job's link confidence,
    // and tag stale postings, so the user sees everything and decides themself.
    jobs = await mapLimit(jobs, 6, async (j) => ({
      ...j,
      linkVerified: await verifyUrl(j.applyUrl),
      stale: !isFresh(j.postedDate, recencyDays + 1),
    }));

    // Sort: verified + fresh first, then by match score. Nothing is dropped.
    const results = jobs
      .map((j) => ({ ...j, linkedin: linkedinContacts(j.company) }))
      .sort((a, b) => {
        const score = (x) =>
          (x.linkVerified ? 1000 : 0) + (x.stale ? -500 : 0) + (x.matchPercentage || 0);
        return score(b) - score(a);
      });

    // Save new ones to the 3-day cache.
    jobsStore.add(results);

    const usage = data.usage || {};
    jobsRegistry.update(jobId, {
      status: 'done',
      progress: 'Done',
      result: {
        jobs: results,
        aggregates,
        meta: {
          foundRaw,
          excludedJunk,
          excludedContract: excludedByTargeting,
          excludedAlreadySeen: excluded,
          totalShown: results.length,
          verifiedCount: results.filter((j) => j.linkVerified).length,
          aggregateCount: aggregates.length,
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

// Guess which job site a URL belongs to, for labeling aggregate listings.
function guessSource(url = '') {
  const u = url.toLowerCase();
  if (u.includes('linkedin')) return 'LinkedIn';
  if (u.includes('cutshort')) return 'Cutshort';
  if (u.includes('naukri')) return 'Naukri';
  if (u.includes('indeed')) return 'Indeed';
  if (u.includes('wellfound') || u.includes('angel.co')) return 'Wellfound';
  if (u.includes('instahyre')) return 'Instahyre';
  if (u.includes('foundit') || u.includes('monster')) return 'Foundit';
  if (u.includes('glassdoor')) return 'Glassdoor';
  return 'Job site';
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
