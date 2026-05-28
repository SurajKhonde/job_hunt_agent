/**
 * Resume PDF parsing.
 *   parseResumeBuffer(buffer) -> raw text from the PDF
 *
 * Uses pdf-parse, a small zero-config library. Extracted text is what we feed
 * to Claude (via /api/resume/parse) to pull out skills + key keywords.
 */

const pdfParse = require('pdf-parse');

async function parseResumeBuffer(buffer) {
  const data = await pdfParse(buffer);
  return (data.text || '').trim();
}

module.exports = { parseResumeBuffer };
