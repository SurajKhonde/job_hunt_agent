import React, { useState, useEffect, useRef } from 'react';
import CompanyCard from './CompanyCard';
import styles from '../styles/app.module.css';

const DEFAULT_SKILLS = [
  'Node.js', 'TypeScript', 'Express', 'React', 'Next.js',
  'MongoDB', 'PostgreSQL', 'Redis', 'AWS', 'Docker',
  'Socket.IO', 'BullMQ', 'REST APIs', 'WebSockets', 'CI/CD',
];

const PAGE_SIZE = 10; // jobs shown per page

export default function Dashboard() {
  const [skills, setSkills] = useState(DEFAULT_SKILLS);
  const [skillInput, setSkillInput] = useState('');
  const [role, setRole] = useState('Full Stack / Backend Node.js Developer');
  const [location, setLocation] = useState('Bangalore or remote-India');
  const [years, setYears] = useState('3-4');
  const [count, setCount] = useState(20);
  const [recencyDays, setRecencyDays] = useState(7);
  const [resumeText, setResumeText] = useState('');
  const [mode, setMode] = useState('jobs'); // 'jobs' | 'directory'

  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [aggregates, setAggregates] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [viewingCache, setViewingCache] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resumeName, setResumeName] = useState('');
  const pollRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  // When the user switches mode, clear the on-screen results so they never see
  // the other mode's list. Each mode shows only its own saved list (via the
  // separate stores) when they click "View saved".
  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setJobs([]); setAggregates([]); setMeta(null); setViewingCache(false);
    setPhase('idle'); setError(null);
  };

  const onUploadResume = async (file) => {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not read resume');
      if (data.skills?.length) setSkills(data.skills);
      if (data.role) setRole(data.role);
      if (data.years) setYears(data.years);
      if (data.resumeText) setResumeText(data.resumeText);
      setResumeName(file.name);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) { setSkills([...skills, s]); setSkillInput(''); }
  };
  const removeSkill = (s) => setSkills(skills.filter((x) => x !== s));

  const run = async () => {
    setPhase("running"); setError(null); setJobs([]); setAggregates([]); setMeta(null);
    setViewingCache(false); setProgress('Starting…');
    try {
      const startRes = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, skills, role, location, years, count, recencyDays, resumeText,
          city: location.split(/[ ,]/)[0] || 'Bangalore',
          stack: skills.join(', '),
        }),
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
            setAggregates(s.result?.aggregates || []);
            setPage(1);
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
    const type = mode === 'directory' ? 'directory' : 'jobs';
    const r = await fetch(`/api/cache?type=${type}`);
    const data = await r.json();
    setJobs(data.jobs || []);
    setMeta({
      verifiedLive: data.jobs?.length || 0,
      cached: true,
      ttlDays: data.ttlDays,
      mode: type,
    });
    setViewingCache(true);
    setPhase('done');
  };

  const clearSaved = async () => {
    const type = mode === 'directory' ? 'directory' : 'jobs';
    if (!confirm(`Clear saved ${type} results? Next ${type} search will start fresh (no dedup).`)) return;
    await fetch(`/api/cache?type=${type}`, { method: 'DELETE' });
    setJobs([]); setAggregates([]); setMeta(null); setViewingCache(false); setPhase('idle');
  };

  const exportCsv = () => {
    if (!jobs.length) return;
    const head = ['Match%','Company','Website','Role','Location','Source','Posted','Apply URL','Matched Skills','Note'];
    const rows = jobs.map((j) => [
      j.matchPercentage, j.company, j.website || j.applyUrl, j.role, j.location, j.source,
      j.postedDate, j.applyUrl, (j.matchedSkills||[]).join('; '), j.note,
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
          Finds full-time Full Stack / Backend roles at mid-size startups & skill-focused
          companies — skips the famous DSA-heavy unicorns, MNCs, and contract roles.
          Recent only, ranked by resume fit.
        </p>
      </header>

      <section className={styles.card}>
        <div className={styles.modeToggle}>
          <button
            className={mode === 'jobs' ? styles.modeActive : styles.modeBtn}
            onClick={() => switchMode('jobs')}
          >
            Job postings
          </button>
          <button
            className={mode === 'directory' ? styles.modeActive : styles.modeBtn}
            onClick={() => switchMode('directory')}
          >
            Company directory (cold-email)
          </button>
        </div>
        <p className={styles.modeHint}>
          {mode === 'jobs'
            ? 'Finds live job postings ranked by resume fit.'
            : 'Finds software-services companies (GoodFirms/Clutch) to email directly — like how you found Technoloader. Many don\u2019t post jobs; you email HR.'}
        </p>

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

        <label className={styles.label}>Resume — upload PDF (auto-extracts your skills)</label>
        <div className={styles.uploadRow}>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => onUploadResume(e.target.files?.[0])}
          />
          <button
            className={styles.addBtn}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Reading PDF…' : '📄 Upload resume PDF'}
          </button>
          {resumeName && <span className={styles.fileName}>✓ {resumeName}</span>}
        </div>

        <label className={styles.label}>…or paste resume text</label>
        <textarea className={styles.textarea} rows={4} placeholder="Paste resume here…"
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
            {mode === 'directory' ? 'View saved companies (30 days)' : 'View saved jobs (3 days)'}
          </button>
          <button className={styles.linkToggle} onClick={clearSaved} disabled={running}>
            Clear saved {mode === 'directory' ? 'companies' : 'jobs'}
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </section>

      {phase === 'done' && (
        <section className={styles.card}>
          <div className={styles.resultHead}>
            <h2 className={styles.heading}>
              {viewingCache
                ? `${jobs.length} saved`
                : meta?.mode === 'directory'
                ? `${jobs.length} companies to email`
                : `${jobs.length} new openings`}
            </h2>
            {meta && (
              <span className={styles.meta}>
                {meta.cached
                  ? `cached · free to view · ${meta.ttlDays}-day window`
                  : meta.mode === 'directory'
                  ? `${meta.excludedJunk || 0} junk dropped · ${meta.verifiedLive} real companies · ${meta.webSearches} searches`
                  : `${meta.totalShown || 0} shown · ${meta.verifiedCount || 0} link-checked · ${meta.aggregateCount || 0} listing pages below · ${meta.excludedContract || 0} contract filtered`}
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
                {jobs
                  .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                  .map((j, i) => <CompanyCard key={i} job={j} />)}
              </div>

              {jobs.length > PAGE_SIZE && (
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ← Prev
                  </button>
                  <span className={styles.pageInfo}>
                    Page {page} of {Math.ceil(jobs.length / PAGE_SIZE)}
                  </span>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.min(Math.ceil(jobs.length / PAGE_SIZE), p + 1))}
                    disabled={page >= Math.ceil(jobs.length / PAGE_SIZE)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}

          {/* Aggregate listing pages — not specific companies, but real search
              pages on Cutshort/LinkedIn/etc. you can browse yourself. */}
          {!viewingCache && aggregates.length > 0 && (
            <div className={styles.aggregates}>
              <h3 className={styles.aggHeading}>
                Listing pages to browse yourself ({aggregates.length})
              </h3>
              <p className={styles.aggHint}>
                These aren’t single companies — they’re search/listing pages found on job
                sites. Open them and scan for roles that fit you.
              </p>
              <div className={styles.aggList}>
                {aggregates.map((a, i) => (
                  <a key={i} className={styles.aggRow} href={a.url} target="_blank" rel="noopener noreferrer">
                    <span className={styles.aggSource}>{a.source}</span>
                    <span className={styles.aggLabel}>{a.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
