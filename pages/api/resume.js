/**
 * /api/resume — upload a PDF resume, extract its text, and have Claude pull a
 * clean skills list + a short profile summary. Returns { skills, resumeText }.
 *
 * The frontend sends the PDF as base64 JSON (simple, no multipart deps).
 * We parse the PDF locally with pdf-parse, then ask Claude to extract skills.
 */

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing in .env.local' });

  try {
    const { pdfBase64 } = req.body || {};
    if (!pdfBase64) return res.status(400).json({ error: 'No PDF provided' });

    // Strip a data-URL prefix if present.
    const b64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(b64, 'base64');

    // Extract text locally. Require the lib entry directly to avoid pdf-parse v1's
    // index.js debug branch that tries to read a sample file when module.parent is unset.
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParse(buffer);
    const resumeText = (parsed.text || '').trim();

    if (!resumeText || resumeText.length < 30) {
      return res.status(422).json({
        error: 'Could not read text from this PDF (it may be a scanned image). Paste your skills manually.',
      });
    }

    // Ask Claude to extract a clean skills list.
    const prompt = `Extract this developer's technical skills from their resume text.
Return ONLY a JSON object, no markdown:
{
  "skills": ["concrete tech skills only — languages, frameworks, databases, tools; max 25"],
  "role": "their best-fit role title in 2-4 words, e.g. 'Full Stack Node.js Developer'",
  "years": "approx years of experience as a string, e.g. '3-4'"
}

RESUME:
${resumeText.slice(0, 6000)}`;

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!apiRes.ok) {
      const t = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Claude API: ${t.slice(0, 200)}` });
    }

    const data = await apiRes.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      extracted = m ? JSON.parse(m[0]) : { skills: [], role: '', years: '' };
    }

    res.status(200).json({
      skills: Array.isArray(extracted.skills) ? extracted.skills : [],
      role: extracted.role || '',
      years: extracted.years || '',
      resumeText: resumeText.slice(0, 4000),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Resume parsing failed' });
  }
}
