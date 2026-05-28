/**
 * Robust JSON-array parser.
 *
 * LLM responses can get cut off mid-array when they hit the token limit
 * (the "0 results" bug — the array never closed, so a naive JSON.parse failed
 * and we got []). This parser salvages every COMPLETE {...} object it can find,
 * even from a truncated array, so a partial response still yields usable rows.
 */
function parseJsonArray(text) {
  if (!text) return [];

  // 1. Clean attempt.
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) return v;
  } catch {}

  const start = text.indexOf('[');
  if (start === -1) return [];
  const region = text.slice(start);

  // 2. Try the whole array region.
  try {
    const v = JSON.parse(region);
    if (Array.isArray(v)) return v;
  } catch {}

  // 3. Salvage balanced {...} objects (handles truncation).
  const objects = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let i = 0; i < region.length; i++) {
    const ch = region[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { objects.push(JSON.parse(region.slice(objStart, i + 1))); } catch {}
        objStart = -1;
      }
    }
  }
  return objects;
}

module.exports = { parseJsonArray };
