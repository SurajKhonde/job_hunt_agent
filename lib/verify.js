/**
 * Check a URL — but FAIL OPEN.
 *
 * Many real job sites (Cutshort, LinkedIn, Wellfound, Greenhouse, …) block
 * automated HEAD/GET requests with 403, or just hang. If we treated those as
 * "dead", we'd throw away perfectly real jobs (that was the "0 results" bug).
 *
 * So this returns:
 *   - false ONLY when the server clearly says the page is gone (404 or 410)
 *   - true for everything else: 200, 403, 405, timeouts, blocks, network errors
 *
 * i.e. we only drop a link we're CONFIDENT is dead; anything uncertain is kept.
 */
async function verifyUrl(url) {
  if (!url || /^https?:\/\//i.test(url) === false) return false;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml',
  };

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
      headers,
    });
    // Only a definitive "gone" status kills the link.
    if (res.status === 404 || res.status === 410) return false;
    return true;
  } catch {
    // Timeout / blocked / network error → KEEP it (fail open).
    return true;
  }
}

module.exports = { verifyUrl };
