/**
 * /api/health — liveness/readiness probe for Docker + orchestrators.
 *
 * Returns 200 only if the process is up AND the disk cache is writable
 * (the one external dependency the app has). Reports whether the Anthropic
 * key is configured, without leaking it. Cheap — safe to poll every few seconds.
 */

import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const checks = {};

  // 1. Cache dir writable (the app's only stateful dependency).
  try {
    const dir = path.join(process.cwd(), '.cache');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.health');
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    checks.cacheWritable = true;
  } catch {
    checks.cacheWritable = false;
  }

  // 2. API key present (not the value — just whether it's set).
  checks.apiKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  const healthy = checks.cacheWritable; // key missing is degraded, not dead
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unhealthy',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  });
}
