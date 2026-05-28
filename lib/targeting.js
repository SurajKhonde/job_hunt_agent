/**
 * Company targeting filters.
 *
 * The candidate wants MID-SIZE startups, service-based companies, and
 * lesser-known product companies that hire on practical skill — NOT the
 * famous unicorns/MNCs that gatekeep with DSA-hard rounds and have brutal
 * competition. This module encodes that preference.
 */

// Well-known high-competition companies to AVOID (unicorns, FAANG-India, top
// product cos with leetcode-heavy hiring + thousands of applicants per role).
// Lowercased substrings; matched loosely against company names.
const AVOID_COMPANIES = [
  // Indian unicorns / famous product startups (DSA-heavy, high competition)
  'meesho', 'razorpay', 'cred', 'swiggy', 'zomato', 'phonepe', 'flipkart',
  'paytm', 'ola', 'oyo', 'dream11', 'groww', 'zerodha', 'sharechat',
  'unacademy', 'byju', 'udaan', 'spinny', 'cars24', 'urban company',
  'urbancompany', 'nykaa', 'delhivery', 'zepto', 'physicswallah', 'navi',
  'slice', 'jupiter', 'khatabook', 'browserstack', 'postman', 'hasura',
  'chargebee', 'freshworks', 'zoho', 'innovaccer', 'darwinbox',
  // Big tech / MNCs
  'google', 'microsoft', 'amazon', 'meta', 'facebook', 'apple', 'netflix',
  'uber', 'linkedin', 'adobe', 'salesforce', 'oracle', 'sap', 'ibm',
  'nvidia', 'intel', 'cisco', 'vmware', 'atlassian', 'stripe', 'databricks',
  'walmart', 'goldman', 'jpmorgan', 'morgan stanley', 'wells fargo',
  // Large Indian IT services (mass hiring, but not the focused mid-size cos he wants)
  'tcs', 'infosys', 'wipro', 'hcl', 'tech mahindra', 'cognizant', 'accenture',
  'capgemini', 'mindtree', 'mphasis', 'ltimindtree', 'persistent',
];

// Contract / staffing red-flags in role titles or company names.
const CONTRACT_FLAGS = [
  'contract', 'contractor', 'c2h', 'c2c', 'freelance', 'temporary', 'temp ',
  'staffing', 'recruitment', 'consultancy', 'manpower', 'payroll',
  'third party', 'staffing solutions', 'rpo',
];

function isAvoided(company = '') {
  const c = company.toLowerCase();
  return AVOID_COMPANIES.some((bad) => c.includes(bad));
}

function isContractRole(job = {}) {
  const hay = `${job.role || ''} ${job.company || ''} ${job.note || ''}`.toLowerCase();
  return CONTRACT_FLAGS.some((flag) => hay.includes(flag));
}

/**
 * Targeting filter — now ONLY excludes contract/staffing roles.
 * (Famous companies / MNCs are no longer auto-dropped — the user wants to see
 * them and decide personally. isAvoided is kept exported in case you want to
 * re-enable it, but passesTargeting no longer calls it.)
 */
function passesTargeting(job = {}) {
  if (isContractRole(job)) return false;
  return true;
}

module.exports = { AVOID_COMPANIES, passesTargeting, isAvoided, isContractRole };
