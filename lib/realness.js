/**
 * Rejects aggregate / placeholder "company names" so only REAL, individually
 * named companies survive. This is what kills the "Multiple companies on
 * LinkedIn" / "10 listings" junk — those are descriptions of search pages,
 * not companies.
 */

const JUNK_TERMS = [
  'multiple', 'various', 'several', 'companies', 'listing', 'listings',
  'confirmed via', 'company name', 'on listing page', 'unknown', 'n/a',
  'employers', 'startups', 'opportunities', 'openings', 'jobs on', 'results',
  'see ', 'browse', 'page', 'aggregat', 'many ', 'numerous',
];

const SITE_NAMES = ['linkedin', 'cutshort', 'naukri', 'indeed', 'wellfound', 'instahyre', 'foundit', 'glassdoor', 'monster', 'angel.co'];

function isRealCompanyName(name = '') {
  const n = String(name).toLowerCase().trim();
  if (!n || n.length < 2) return false;
  // A real company name is short-ish and specific; junk entries are descriptive.
  if (n.split(/\s+/).length > 6) return false;
  // "Cutshort — ...", "LinkedIn - ...", "LinkedIn: ..." style aggregate labels.
  if (SITE_NAMES.some((s) => n.startsWith(s) && /[—\-:|]/.test(n))) return false;
  return !JUNK_TERMS.some((t) => n.includes(t));
}

// Needs a plausible website OR a direct apply URL on a real domain.
function hasUsableLink(job = {}) {
  const url = job.website || job.applyUrl || '';
  return /^https?:\/\/[^\s]+\.[^\s]+/i.test(url);
}

function isRealCompany(job = {}) {
  return isRealCompanyName(job.company) && hasUsableLink(job);
}

module.exports = { isRealCompanyName, hasUsableLink, isRealCompany };
