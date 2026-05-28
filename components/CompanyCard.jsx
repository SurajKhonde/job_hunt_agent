import React, { useState } from 'react';
import styles from '../styles/app.module.css';

export default function CompanyCard({ job }) {
  const [open, setOpen] = useState(false);
  const color = job.matchPercentage >= 85 ? '#10b981'
    : job.matchPercentage >= 70 ? '#f59e0b' : '#94a3b8';

  // Prefer the company's own website; fall back to the apply URL's domain.
  const website = job.website || job.applyUrl || '';
  const domain = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  return (
    <div className={styles.job}>
      <div className={styles.jobTop}>
        <div>
          <div className={styles.jobCompany}>{job.company}</div>
          <div className={styles.jobRole}>{job.role}</div>
        </div>
        {!job.directory && (
          <span className={styles.matchBadge} style={{ background: color }}>
            {job.matchPercentage}%
          </span>
        )}
      </div>

      {website && (
        <a className={styles.jobWebsite} href={website} target="_blank" rel="noopener noreferrer">
          🌐 {domain}
        </a>
      )}

      <div className={styles.jobMeta}>
        <span>{job.location}</span>
        {job.postedDate && <><span className={styles.dot}>·</span><span>{job.postedDate}</span></>}
        <span className={styles.dot}>·</span>
        <span>{job.source}</span>
      </div>

      <div className={styles.badges}>
        {!job.directory && (
          job.linkVerified
            ? <span className={styles.badgeOk}>✓ link checked</span>
            : <span className={styles.badgeWarn}>⚠ link unverified — open to confirm</span>
        )}
        {job.stale && <span className={styles.badgeStale}>may be older than your window</span>}
      </div>

      {job.matchedSkills?.length > 0 && (
        <div className={styles.jobSkills}>
          {job.matchedSkills.map((s, k) => <span key={k} className={styles.miniTag}>{s}</span>)}
        </div>
      )}

      {job.note && <p className={styles.jobNote}>{job.note}</p>}

      <div className={styles.cardActions}>
        {job.applyUrl && (
          <a className={styles.applyBtn} href={job.applyUrl} target="_blank" rel="noopener noreferrer">
            {job.directory ? 'Open careers page →' : 'Open job →'}
          </a>
        )}
        <button className={styles.linkToggle} onClick={() => setOpen(!open)}>
          {open ? 'Hide LinkedIn' : 'Find people on LinkedIn'}
        </button>
      </div>

      {open && job.linkedin && (
        <div className={styles.outreach}>
          {job.linkedin.map((p, k) => (
            <a key={k} className={styles.outreachRow} href={p.url} target="_blank" rel="noopener noreferrer">
              <span className={styles.outreachRole}>{p.role}</span>
              <span className={styles.outreachWhy}>{p.why}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
