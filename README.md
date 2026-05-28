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

## Running with Docker

The backend runs as a small standalone Node image with a built-in health check.

```bash
# 1. put your key in a .env file (compose reads it)
cp .env.example .env        # edit .env, set ANTHROPIC_API_KEY

# 2. build + run
docker compose up --build -d

# 3. open
#    http://localhost:3000
```

Check health:

```bash
docker compose ps                  # STATUS shows "healthy" once probes pass
curl http://localhost:3000/api/health
# -> {"status":"ok","uptimeSeconds":..,"checks":{"cacheWritable":true,"apiKeyConfigured":true}}
```

Notes:
- The container `HEALTHCHECK` polls `/api/health` every 30s; it reports unhealthy if the
  cache dir isn't writable.
- The 3-day result cache persists in a named volume (`job-hunter-cache`), so restarts keep
  your saved results and dedup history.
- The API key is passed at runtime via `.env` — it is never baked into the image.

Without compose (plain Docker):

```bash
docker build -t job-hunter .
docker run -d -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-xxxx \
  -v job-hunter-cache:/app/.cache \
  --name job-hunter job-hunter
```

## Targeting (who it looks for)

This build is tuned for a practical, ship-focused engineer who does NOT want to fight
DSA-gatekept mega-competition:

- **Targets:** mid-size startups (~Series A/B), service/studio companies, and lesser-known
  PRODUCT companies that hire on real skill. Full-time only.
- **Skips automatically:** famous unicorns & high-competition startups (Meesho, Razorpay,
  CRED, Swiggy, PhonePe, Flipkart, Groww, …), big MNCs / FAANG-India, mass IT-services
  giants (TCS, Infosys, Wipro, …), and any contract / C2H / staffing role.

Edit the lists in `lib/targeting.js` to taste — add companies you want skipped, or remove
ones you actually want to see. The results header shows how many were filtered out.

## Two modes

**Job postings** (default) — finds live job postings ranked by resume fit, recent only.

**Company directory (cold-email)** — finds software-SERVICES companies (the Technoloader
type) from directories like GoodFirms & Clutch, by city + stack. These are profitable,
owner-run dev shops that often DON'T post on job boards — so you go to their website /
careers page and email HR directly. This is the proven cold-outreach path: find company →
email "I'm a full-stack dev, are you hiring?" → get a call. Output is company name +
website + careers page, optimized for direct outreach (no match score — it's a contact list).

Toggle between them at the top of the form. Each mode has its OWN cache: job postings expire in 3 days (freshness matters), services
companies stay 30 days (they don't change). So directory companies are not re-fetched
every few days — saving tokens — while job postings stay fresh.

## Resume PDF upload

Click **Upload resume PDF** — the app extracts the text (pdf-parse) and asks Claude to
pull a clean skills list, your best-fit role, and approximate years. These auto-fill the
form, so you don't type skills by hand. (Scanned/image-only PDFs can't be read — paste text
instead.) You can still edit the skill tags afterward.

## Separate saved lists per mode

The two modes keep completely separate saved lists:
- **Job postings** → "View saved jobs (3 days)" → reads the jobs store
- **Company directory** → "View saved companies (30 days)" → reads the directory store

Switching modes clears the on-screen results, so you always see only the current mode's
list — never a mix.
