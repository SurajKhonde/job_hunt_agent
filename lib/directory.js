/**
 * Directory mode — finds SOFTWARE SERVICES companies (Technoloader-type) from
 * directories like GoodFirms, Clutch, and similar, by city + tech stack.
 *
 * These are profitable, owner-run services/agency companies that mostly DON'T
 * post on job boards — you find them, go to their site, and cold-email HR
 * (the candidate's proven method). So this mode returns company NAME + WEBSITE
 * + a guessed careers URL, optimized for direct outreach rather than apply links.
 */

const { directoryStore, jobKey } = require('./store');
const { passesTargeting } = require('./targeting');
const { isRealCompanyName } = require('./realness');
const { parseJsonArray } = require('./parse');
const jobsRegistry = require('./jobs');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

async function runDirectoryJob(jobId, params) {
  const {
    skills = [],
    city = 'Bangalore',
    stack = 'Node.js, JavaScript, TypeScript, React, full stack',
    count = 25,
    maxSearches = 10,
  } = params || {};

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing in .env.local');

    const { keys: seenKeys, companies: seenCompanies } = directoryStore.getSeen();
    jobsRegistry.update(jobId, { progress: 'Searching company directories…' });

    const skillLine = Array.isArray(skills) ? skills.join(', ') : String(skills);
    const excludeList = seenCompanies.slice(0, 80).join(', ');

    const prompt = `You are a researcher building a cold-outreach list of SOFTWARE SERVICES /
web-development companies a candidate can email directly about a full-stack job.

CANDIDATE: full-stack engineer, skills: ${skillLine}. Target city: ${city}.
Wants companies working in: ${stack}.

WHERE TO LOOK — company directories (NOT job boards):
- GoodFirms (goodfirms.co/directory/city/top-software-development-companies/${city.toLowerCase()})
- Clutch (clutch.co) software/web-dev companies in ${city}
- DesignRush, TechReviewer, similar IT-services directories
- NASSCOM member listings for ${city}
Also fine: company websites you find that are clearly ${city}-based dev shops/agencies/product cos.

WHAT TO RETURN — real, individually NAMED companies (Technoloader-type: small/mid services
& product companies, agencies, dev studios). For EACH: the company's real name, its OWN
website domain, a one-line description of what they do, and the likely careers/contact page.

AVOID: famous unicorns, big MNCs, mass IT giants (TCS/Infosys/Wipro/etc.), pure staffing firms.
EXCLUDE already-seen: ${excludeList || '(none yet)'}

Find about ${count} companies. Reply with ONLY a JSON array, each item:
{"company":"","website":"","description":"","careersUrl":"likely careers/contact page URL","stackFit":"why their work fits a Node/full-stack dev"}
Every item MUST be a specific named company with a real website. No "multiple companies" / aggregate entries.`;

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

    let companies = parseJsonArray(text);
    const foundRaw = companies.length;

    // Keep only real named companies with a website.
    companies = companies.filter(
      (c) => isRealCompanyName(c.company) && /^https?:\/\/[^\s]+\.[^\s]+/i.test(c.website || '')
    );
    const excludedJunk = foundRaw - companies.length;

    // Targeting (drop famous/MNC) + dedup.
    companies = companies.filter((c) => passesTargeting({ company: c.company, role: '' }));
    companies = companies.filter((c) => !seenKeys.has(jobKey({ applyUrl: c.website, company: c.company })));

    // Normalize into the shared "job" shape so it reuses the cache + UI.
    const results = companies.map((c) => ({
      company: c.company,
      website: c.website,
      role: 'Direct outreach (services company)',
      location: city,
      source: 'Directory',
      applyUrl: c.careersUrl || c.website,
      note: c.description || c.stackFit || '',
      matchedSkills: [],
      matchPercentage: 0, // directory mode isn't scored — it's an outreach list
      directory: true,
      careersUrl: c.careersUrl || `${stripPath(c.website)}/careers`,
    }));

    directoryStore.add(results);

    const usage = data.usage || {};
    jobsRegistry.update(jobId, {
      status: 'done',
      progress: 'Done',
      result: {
        jobs: results,
        meta: {
          mode: 'directory',
          foundRaw,
          excludedJunk,
          verifiedLive: results.length,
          webSearches: usage.server_tool_use?.web_search_requests || 0,
          outputTokens: usage.output_tokens || 0,
          rawIfEmpty: results.length === 0 ? text.slice(0, 1200) : undefined,
        },
      },
    });
  } catch (err) {
    jobsRegistry.update(jobId, { status: 'error', error: err.message || 'Directory search failed' });
  }
}

function stripPath(url = '') {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.replace(/\/.*$/, '');
  }
}

module.exports = { runDirectoryJob };
