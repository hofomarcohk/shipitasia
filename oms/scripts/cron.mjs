// P17 — node-cron driver.
//
// Pure JS so it can run via `node scripts/cron.mjs` without a TS
// transform. All business logic lives behind /api/cron/* HTTP routes
// so this file only owns scheduling + retries.
//
// Schedule (HK local; node-cron supports tz):
//   - 02:00 daily → abandonment scan (warn + abandon at 14/25/30 HK-days)
//   - 06:00 daily → YT rollover (pre-create today's YT outbound per warehouse)
//
// Auth: shared CRON_SECRET. Set in .env (must match the value the
// Next.js process reads). Dev without CRON_SECRET still works because
// requireCronAuth() bypasses when unset + NODE_ENV != production.
//
// Run locally:
//   node scripts/cron.mjs           # uses defaults
//   CRON_BASE_URL=http://localhost:3002 CRON_SECRET=dev-secret \
//     node scripts/cron.mjs
//
// Run under PM2 (see ecosystem.config.js entry):
//   pm2 start ecosystem.config.js --only vw_shipping_cron
//
// Manual trigger (no schedule wait):
//   curl -X POST http://localhost:3002/api/cron/abandonment-scan \
//     -H "Authorization: Bearer $CRON_SECRET"

import "dotenv/config";
import cron from "node-cron";

const BASE_URL = process.env.CRON_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET ?? "";
const TZ = "Asia/Hong_Kong";

const JOBS = [
  {
    name: "abandonment-scan",
    schedule: "0 2 * * *",
    path: "/api/cron/abandonment-scan",
  },
  {
    name: "yt-rollover",
    schedule: "0 6 * * *",
    path: "/api/cron/yt-rollover",
  },
];

async function triggerJob(job) {
  const url = `${BASE_URL}${job.path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(SECRET ? { authorization: `Bearer ${SECRET}` } : {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    const ms = Date.now() - start;
    if (res.ok) {
      console.log(
        `[cron] ${job.name} OK ${ms}ms`,
        JSON.stringify(body.data ?? {})
      );
    } else {
      console.error(
        `[cron] ${job.name} FAIL ${res.status} ${ms}ms`,
        JSON.stringify(body)
      );
    }
  } catch (err) {
    console.error(`[cron] ${job.name} EXCEPTION`, err?.message ?? err);
  }
}

for (const job of JOBS) {
  cron.schedule(job.schedule, () => triggerJob(job), { timezone: TZ });
  console.log(`[cron] registered ${job.name} @ ${job.schedule} (${TZ})`);
}

// Optional: trigger all jobs once on boot so a fresh PM2 restart can
// catch up on missed work. Disabled by default — enable per-deploy
// with CRON_BOOT_RUN=1.
if (process.env.CRON_BOOT_RUN === "1") {
  console.log("[cron] CRON_BOOT_RUN=1 — running all jobs once now");
  for (const job of JOBS) await triggerJob(job);
}

console.log(`[cron] driver up; base=${BASE_URL} tz=${TZ}`);
