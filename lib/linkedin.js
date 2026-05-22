/**
 * Generates ready-to-click LinkedIn people-search links for a company.
 *
 * These open LinkedIn's normal people search in YOUR logged-in browser —
 * no scraping, no automation, fully within LinkedIn's terms. You click,
 * you see real people, you connect/message yourself.
 *
 * We target the 3 people most worth contacting for a mid-level engineer:
 *   1. Recruiter / Talent Acquisition  (owns the pipeline)
 *   2. Engineering Manager / Tech Lead  (the hiring manager)
 *   3. A Senior/Backend Engineer        (a peer who can REFER you — gold in India)
 */

function peopleSearchUrl(keywords) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    keywords
  )}&origin=GLOBAL_SEARCH_HEADER`;
}

function linkedinContacts(company) {
  return [
    {
      role: 'Recruiter / Talent',
      url: peopleSearchUrl(`${company} recruiter talent acquisition`),
      why: 'Owns the hiring pipeline — fastest path in.',
    },
    {
      role: 'Engineering Manager',
      url: peopleSearchUrl(`${company} engineering manager backend`),
      why: 'The actual hiring manager for the role.',
    },
    {
      role: 'Senior Engineer (referral)',
      url: peopleSearchUrl(`${company} senior backend engineer node`),
      why: 'A peer who can refer you internally — highest reply rate.',
    },
  ];
}

module.exports = { linkedinContacts };
