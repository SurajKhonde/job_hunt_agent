# Job Hunter

Enter your skills (and optionally paste your resume) → it uses **your Claude API key
to search the live web** across LinkedIn, Cutshort, Glassdoor, Wellfound, Instahyre,
Lever, Greenhouse, and company career pages → returns **recent** openings **ranked by
resume fit**, with verified apply links and 3 LinkedIn people-search links per company.

## What's built in

- **Polling, no timeouts.** A search takes 30–60s, so the request would normally time
  out. Instead the app starts a background job, returns instantly, and the UI polls for
  progress until results are ready.
- **3-day cache (saves tokens).** Every result is saved to `.cache/cache.json` for 3
  days. Re-view them anytime for free with **View saved** — no API cost.
- **Dedup across runs.** Each new search **excludes companies already found** in the last
  3 days, so run 2 brings only NEW openings. Counts show how many were skipped.
- **Freshness filter.** Only postings within your chosen window (3 / 7 / 14 days) are
  kept. Stale listings are dropped.
- **Verified links.** Every apply URL is checked live before you see it — no dead or
  hallucinated links.
- **Outreach built in.** Each match gives 3 ready-to-click LinkedIn people searches
  (recruiter, eng manager, a senior engineer who can refer you).

## Setup

```bash
npm install
cp .env.example .env.local      # paste your key from console.anthropic.com
npm run dev
```

Open http://localhost:3000

## Using it

1. Skills are pre-filled — add/remove by clicking tags.
2. (Recommended) paste your resume text for sharper match scores.
3. Pick how many to find + max posting age.
4. **Find New Matching Jobs** → it searches in the background; you'll see live progress.
5. Review ranked results, expand **Ping people on LinkedIn**, or **Download CSV**.
6. **View saved** re-shows the last 3 days for free. **Clear saved** resets dedup.

## How the pieces fit

```
pages/api/search/start.js   creates a background job, returns jobId instantly
pages/api/search/status.js  the UI polls this for progress + results
pages/api/cache.js          GET saved results (free) / DELETE to clear
lib/engine.js               THE ENGINE: Claude web_search → freshness → dedup → verify → save
lib/store.js                disk cache w/ 3-day TTL + dedup keys
lib/jobs.js                 in-memory job registry for polling
lib/verify.js               checks each apply URL is live
lib/linkedin.js             builds the 3 people-search links per company
components/Dashboard.jsx     inputs, polling, saved-view, CSV export
components/CompanyCard.jsx   one result: all data + apply + outreach
```

## Cost

~$0.50–$2.50 per *new* search (web searches + tokens). Viewing saved results is free.
Real numbers show after each run.

## Notes / honest limits

- Posting dates & salaries are filled when the listing shows them, blank otherwise.
- No private HR emails — you get LinkedIn people-search links instead (click in your own
  browser; fully legitimate, no automation).
- The cache lives in `.cache/` next to the app. Deleting that folder also resets dedup.
- It finds + ranks the jobs; the reply rate still comes from a sharp personal message and
  following up. That part stays yours — and it's your edge.
