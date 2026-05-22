import React, { useState, useEffect, useRef } from 'react';
import CompanyCard from './CompanyCard';
import styles from '../styles/app.module.css';

const DEFAULT_SKILLS = [
  'Node.js', 'TypeScript', 'Express', 'React', 'Next.js',
  'MongoDB', 'PostgreSQL', 'Redis', 'AWS', 'Docker',
  'Socket.IO', 'BullMQ', 'REST APIs', 'WebSockets', 'CI/CD',
];

export default function Dashboard() {
  const [skills, setSkills] = useState(DEFAULT_SKILLS);
  const [skillInput, setSkillInput] = useState('');
  const [role, setRole] = useState('Full Stack / Backend Node.js Developer');
  const [location, setLocation] = useState('Bangalore or remote-India');
  const [years, setYears] = useState('3-4');
  const [count, setCount] = useState(20);
  const [recencyDays, setRecencyDays] = useState(7);
  const [resumeText, setResumeText] = useState('');

  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [viewingCache, setViewingCache] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) { setSkills([...skills, s]); setSkillInput(''); }
  };
  const removeSkill = (s) => setSkills(skills.filter((x) => x !== s));

  const run = async () => {
    setPhase('running'); setError(null); setJobs([]); setMeta(null);
    setViewingCache(false); setProgress('Starting…');
    try {
      const startRes = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills, role, location, years, count, recencyDays, resumeText }),
      });
      const { jobId, error: startErr } = await startRes.json();
      if (!jobId) throw new Error(startErr || 'Could not start search');

      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/search/status?jobId=${jobId}`);
          const s = await r.json();
          if (s.progress) setProgress(s.progress);
          if (s.status === 'done') {
            clearInterval(pollRef.current);
            setJobs(s.result?.jobs || []);
            setMeta(s.result?.meta || null);
            setPhase('done');
          } else if (s.status === 'error') {
            clearInterval(pollRef.current);
            setError(s.error || 'Search failed');
            setPhase('error');
          }
        } catch {
          // transient — keep polling
        }
      }, 3000);
    } catch (e) {
      setError(e.message); setPhase('error');
    }
  };

  const viewSaved = async () => {
    const r = await fetch('/api/cache');
    const data = await r.json();
    setJobs(data.jobs || []);
    setMeta({ verifiedLive: data.jobs?.length || 0, cached: true, ttlDays: data.ttlDays });
    setViewingCache(true);
    setPhase('done');
  };

  const clearSaved = async () => {
    if (!confirm('Clear all saved results? Next search will start fresh (no dedup).')) return;
    await fetch('/api/cache', { method: 'DELETE' });
    setJobs([]); setMeta(null); setViewingCache(false); setPhase('idle');
  };

  const exportCsv = () => {
    if (!jobs.length) return;
    const head = ['Match%','Company','Role','Location','Source','Posted','Salary','Apply URL','Matched','Missing','Note'];
    const rows = jobs.map((j) => [
      j.matchPercentage, j.company, j.role, j.location, j.source, j.postedDate,
      j.salary, j.applyUrl, (j.matchedSkills||[]).join('; '), (j.missingSkills||[]).join('; '), j.note,
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `matches-${Date.now()}.csv`;
    a.click();
  };

  const running = phase === 'running';

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Job Hunter</h1>
        <p className={styles.subheading}>
          Searches LinkedIn, Cutshort, Glassdoor, Lever, Greenhouse & career pages for
          recent openings, ranked by resume fit. Saves results 3 days and skips ones
          you've already seen.
        </p>
      </header>

      <section className={styles.card}>
        <label className={styles.label}>Target role</label>
        <input className={styles.input} value={role} onChange={(e) => setRole(e.target.value)} />

        <div className={styles.twoCol}>
          <div>
            <label className={styles.label}>Location</label>
            <input className={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <label className={styles.label}>Experience (yrs)</label>
            <input className={styles.input} value={years} onChange={(e) => setYears(e.target.value)} />
          </div>
        </div>

        <label className={styles.label}>Your skills</label>
        <div className={styles.skillRow}>
          <input className={styles.input} placeholder="Add a skill, press Enter"
            value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSkill()} />
          <button className={styles.addBtn} onClick={addSkill}>Add</button>
        </div>
        <div className={styles.tags}>
          {skills.map((s) => <span key={s} className={styles.tag} onClick={() => removeSkill(s)}>{s} ×</span>)}
        </div>

        <label className={styles.label}>Paste your resume text (optional — sharper scoring)</label>
        <textarea className={styles.textarea} rows={5} placeholder="Paste resume here…"
          value={resumeText} onChange={(e) => setResumeText(e.target.value)} />

        <div className={styles.twoCol}>
          <div>
            <label className={styles.label}>How many to find</label>
            <div className={styles.options}>
              {[15, 20, 30, 40].map((n) => (
                <label key={n} className={styles.option}>
                  <input type="radio" name="count" checked={count === n} onChange={() => setCount(n)} />{n}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={styles.label}>Max posting age (days)</label>
            <div className={styles.options}>
              {[3, 7, 14].map((n) => (
                <label key={n} className={styles.option}>
                  <input type="radio" name="rec" checked={recencyDays === n} onChange={() => setRecencyDays(n)} />{n}
                </label>
              ))}
            </div>
          </div>
        </div>

        <p className={styles.note}>
          ~${(count * 0.03).toFixed(2)}–${(count * 0.06).toFixed(2)} per run. Saved results
          are free to re-view for 3 days, and each run skips companies already found.
        </p>

        <button className={styles.searchBtn} onClick={run} disabled={running}>
          {running ? `Searching… ${progress}` : 'Find New Matching Jobs'}
        </button>

        <div className={styles.secondaryRow}>
          <button className={styles.linkToggle} onClick={viewSaved} disabled={running}>
            View saved (last 3 days)
          </button>
          <button className={styles.linkToggle} onClick={clearSaved} disabled={running}>
            Clear saved
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </section>

      {phase === 'done' && (
        <section className={styles.card}>
          <div className={styles.resultHead}>
            <h2 className={styles.heading}>
              {viewingCache ? `${jobs.length} saved openings` : `${jobs.length} new openings`}
            </h2>
            {meta && (
              <span className={styles.meta}>
                {meta.cached
                  ? `cached · free to view · ${meta.ttlDays}-day window`
                  : `${meta.excludedAlreadySeen || 0} skipped (already seen) · ${meta.webSearches} searches · ${meta.verifiedLive} live`}
              </span>
            )}
          </div>

          {jobs.length === 0 ? (
            <>
              <p className={styles.subheading}>
                {viewingCache
                  ? 'Nothing saved yet — run a search first.'
                  : 'No new openings this run. Everything fresh may already be saved — try “View saved”, raise the count, or widen posting age.'}
              </p>
              {meta?.rawIfEmpty && <pre className={styles.raw}>{meta.rawIfEmpty}</pre>}
            </>
          ) : (
            <>
              <div className={styles.listActions}>
                <button className={styles.addBtn} onClick={exportCsv}>Download CSV</button>
              </div>
              <div className={styles.jobs}>
                {jobs.map((j, i) => <CompanyCard key={i} job={j} />)}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
