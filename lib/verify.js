/**
 * Verify a URL actually resolves, so we never show a dead/hallucinated apply link.
 * Tries HEAD first (cheap); some sites block HEAD, so a 405 still means "exists".
 */
async function verifyUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (job-hunter link check)' },
    });
    if (res.ok || res.status === 405 || res.status === 403) return true;
    // Some sites 404 on HEAD but serve on GET — one cheap retry.
    const res2 = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (job-hunter link check)' },
    });
    return res2.ok;
  } catch {
    return false;
  }
}

module.exports = { verifyUrl };
