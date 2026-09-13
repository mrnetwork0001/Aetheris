// Records real footage of the live Aetheris site with Playwright and encodes it
// to 1920x1080 30fps H.264 mp4 files in public/clips.
//
//   node scripts/capture.mjs            # all clips
//   node scripts/capture.mjs dashboard  # one or more clip names
//   SCROLL=wheel node scripts/capture.mjs   # drive scrolling with mouse.wheel steps
//
// Uses Google Chrome stable (channel "chrome"); falls back to the bundled
// chromium if that fails. Raw webm files go to a scratch dir (CAPTURE_TMP or
// the OS temp dir), never to public/clips, so a failed run leaves no partial
// files behind. Each clip is trimmed so the footage starts once the page is
// ready (network idle and, on live pages, the "Live" pills rendered).
//
// Scrolling: a requestAnimationFrame loop inside the page moves a few pixels
// per frame. Playwright's mouse.wheel round-trips through the protocol at
// roughly 50ms per call, which makes wheel-driven motion both slow and uneven,
// so rAF is the default; SCROLL=wheel keeps the wheel path for comparison.

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "clips");
const TMP = fs.mkdtempSync(path.join(process.env.CAPTURE_TMP || os.tmpdir(), "aetheris-capture-"));
const SITE = process.env.SITE || "https://useaetheris.vercel.app";
const AGENCY = "0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81";
const TOPIC = "0.0.10518320";
const W = 1920, H = 1080;
const USE_WHEEL = process.env.SCROLL === "wheel";

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function launch() {
  try {
    const b = await chromium.launch({ channel: "chrome", headless: true });
    log("browser: Google Chrome (channel chrome)");
    return b;
  } catch (e) {
    log("chrome channel failed:", e.message.split("\n")[0]);
    const deadline = Date.now() + 15 * 60 * 1000;
    for (;;) {
      try {
        const b = await chromium.launch({ headless: true });
        log("browser: bundled chromium");
        return b;
      } catch (err) {
        if (Date.now() > deadline) throw err;
        log("bundled chromium not ready, retrying in 30s");
        await sleep(30000);
      }
    }
  }
}

// Slow, even scroll: `step` px per animation frame (60Hz), never a jump.
async function scrollBy(page, px, step = 5) {
  px = Math.round(px);
  if (!px) return;
  if (USE_WHEEL) {
    const dir = Math.sign(px);
    let left = Math.abs(px);
    while (left > 0) {
      const d = Math.min(step, left);
      await page.mouse.wheel(0, dir * d);
      left -= d;
      await page.waitForTimeout(16);
    }
    return;
  }
  await page.evaluate(([px, step]) => new Promise((resolve) => {
    const dir = Math.sign(px);
    let left = Math.abs(px);
    const tick = () => {
      const d = Math.min(step, left);
      window.scrollBy(0, dir * d);
      left -= d;
      if (left > 0) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  }), [px, step]);
}

// Scrolls until the element (selector or locator) sits `offset` px from the top.
async function scrollToEl(page, target, { offset = 96, step = 5 } = {}) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  const box = await loc.boundingBox();
  if (!box) throw new Error("scrollToEl: element not found");
  await scrollBy(page, box.y - offset, step);
}

async function scrollToBottom(page, step = 5) {
  const rest = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight - window.scrollY);
  await scrollBy(page, rest, step);
}

async function prep(page) {
  await page.addStyleTag({
    content: "html{scroll-behavior:auto!important} ::-webkit-scrollbar{display:none!important}",
  });
}

async function waitLive(page) {
  await page.getByText(/^\s*Live\s*$/).first().waitFor({ state: "visible", timeout: 30000 });
}

async function gotoSite(page, url, { live = false } = {}) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  if (live) await waitLive(page);
  await prep(page);
  await page.waitForTimeout(600);
}

// Records one clip. `fn` drives the page and returns the timestamp (ms) at
// which the footage should start, so page loading is trimmed away.
async function record(browser, name, fn) {
  const t0 = Date.now();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir: TMP, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  const report = { name, ok: false, notes: [] };
  let startAt = t0;
  try {
    startAt = (await fn(page, report)) ?? t0;
    report.ok = true;
  } catch (e) {
    report.notes.push("capture failed: " + e.message.split("\n")[0]);
  }
  const video = page.video();
  await context.close();
  const webm = video ? await video.path() : null;
  if (!report.ok || !webm) {
    if (webm && fs.existsSync(webm)) fs.unlinkSync(webm);
    return report;
  }
  const ss = Math.max(0, (startAt - t0) / 1000).toFixed(2);
  const mp4 = path.join(OUT, `${name}.mp4`);
  const tmpMp4 = path.join(TMP, `${name}.mp4`);
  const ff = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", webm, "-ss", ss, "-r", "30",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
    "-vf", `scale=${W}:${H}`, "-an", tmpMp4,
  ], { stdio: "inherit" });
  fs.unlinkSync(webm);
  if (ff.status !== 0) {
    report.ok = false;
    report.notes.push("ffmpeg failed");
    return report;
  }
  fs.copyFileSync(tmpMp4, mp4);
  fs.unlinkSync(tmpMp4);
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:format=duration",
    "-of", "default=noprint_wrappers=1", mp4,
  ], { encoding: "utf8" }).stdout;
  report.probe = probe.trim().replace(/\n/g, " ");
  report.file = mp4;
  return report;
}

// ---------- clips ----------

const clips = {
  // (1) landing, ~26s: hero, then every section down to the sponsor row and footer.
  async landing(page) {
    await gotoSite(page, `${SITE}/`);
    const start = Date.now();
    await page.waitForTimeout(3000);
    for (const id of ["how-it-works", "ledger", "ecosystem", "compare", "faq", "contracts"]) {
      await scrollToEl(page, `#${id}`, { offset: 80, step: 6 });
      await page.waitForTimeout(1100);
    }
    await scrollToBottom(page, 6);
    await page.waitForTimeout(1800);
    return start;
  },

  // (2) dashboard, ~30s: operator view, expand the newest job, leaderboard, treasury, audit stream.
  async dashboard(page, report) {
    await gotoSite(page, `${SITE}/dashboard`, { live: true });
    // The newest job auto-expands; collapse it before recording so the click is real footage.
    const collapse = page.locator("button[aria-label^='Collapse job']").first();
    if (await collapse.count()) {
      await collapse.click();
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(W / 2, H / 2);
    await page.waitForTimeout(400);
    const start = Date.now();
    await page.waitForTimeout(3000); // header + stat row

    await scrollToEl(page, "#jobs", { offset: 88, step: 4 });
    await page.waitForTimeout(900);
    const expand = page.locator("button[aria-label^='Expand job']").first();
    const label = await expand.getAttribute("aria-label");
    const jobNo = (label.match(/\d+/) || ["?"])[0];
    const box = await expand.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
    await page.waitForTimeout(300);
    await expand.click();
    await page.waitForTimeout(600);
    const detail = page.locator(`button[aria-label='Collapse job ${jobNo}']`).locator("xpath=ancestor::tr[1]/following-sibling::tr[1]");
    const text = (await detail.textContent().catch(() => "")) || "";
    report.notes.push(`expanded job ${jobNo}: assignments=${/Sub-agent assignments/i.test(text)} paid=${/Paid/i.test(text)} hcs=${(text.match(/HCS #\d+/g) || []).join(",") || "none"}`);
    const dbox = await detail.boundingBox().catch(() => null);
    if (dbox && dbox.y + dbox.height > H - 40) await scrollBy(page, dbox.y + dbox.height - (H - 60), 4);
    await page.waitForTimeout(3000);

    await scrollToEl(page, "#agents", { offset: 88, step: 5 });
    await page.waitForTimeout(2000);
    await scrollToEl(page, "#treasury", { offset: 88, step: 5 });
    await page.waitForTimeout(2000);
    await scrollToEl(page, "#audit", { offset: 88, step: 5 });
    await page.waitForTimeout(3000);
    return start;
  },

  // (3) brief, ~16s: client role, Fund a job card, type a title, pick a role, type a brief. Never submit.
  async brief(page, report) {
    await gotoSite(page, `${SITE}/dashboard`, { live: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    const start = Date.now();
    await page.waitForTimeout(800);
    const client = page.locator("button", { hasText: /^\s*Client\s*$/ }).first();
    const cb = await client.boundingBox();
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 20 });
    await client.click();
    await page.waitForTimeout(1500);

    const fund = page.locator("section#fund");
    await fund.waitFor({ timeout: 15000 });
    await scrollToEl(page, fund, { offset: 64, step: 7 });
    await page.waitForTimeout(900);

    const title = fund.locator("input[type='text']").last();
    const role = fund.locator("select").last();
    const area = fund.locator("textarea").first();
    const submit = fund.locator("button[type='submit']").first();
    const disabled = await title.isDisabled();
    report.notes.push(`title field disabled=${disabled}`);
    if (!disabled) {
      await title.click();
      await page.keyboard.type("Security review of the escrow settlement path", { delay: 35 });
      await page.waitForTimeout(500);
      const opts = await role.locator("option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
      const sec = opts.find((o) => /security-audit/.test(o.v) || /security-audit/.test(o.t || ""));
      await role.selectOption(sec ? { value: sec.v } : { label: /security/i });
      report.notes.push(`role selected=${sec ? sec.v : "?"}`);
      await page.waitForTimeout(700);
      await area.click();
      await page.keyboard.type(
        "Audit the settleJob and refund paths in AetherisAgency for reentrancy, double settlement and escrow accounting drift. Deliver a ranked findings list with severity, affected lines and a suggested fix for each.",
        { delay: 30 },
      );
      await page.waitForTimeout(400);
      report.notes.push(`submit button "${((await submit.textContent().catch(() => "?")) || "").trim()}" disabled=${await submit.isDisabled().catch(() => "?")} (never clicked)`);
    } else {
      report.notes.push("fields disabled; card text: " + ((await fund.textContent()) || "").slice(0, 200));
    }
    await page.waitForTimeout(2000);
    return start;
  },

  // (4) docs, ~12s: the sub-agent worker page.
  async docs(page) {
    await gotoSite(page, `${SITE}/docs/agents`);
    const start = Date.now();
    await page.waitForTimeout(1800);
    for (const id of ["loop", "run"]) {
      await scrollToEl(page, `#${id}`, { offset: 96, step: 7 });
      await page.waitForTimeout(1200);
    }
    await scrollBy(page, 900, 6);
    await page.waitForTimeout(1200);
    return start;
  },

  // (5) agency, ~12s: the public agency profile.
  async agency(page) {
    await gotoSite(page, `${SITE}/agency/${AGENCY}`, { live: true });
    const start = Date.now();
    await page.waitForTimeout(1800);
    for (const id of ["agency-jobs", "agency-settlements", "agency-subagents", "agency-hcs"]) {
      await scrollToEl(page, `#${id}`, { offset: 88, step: 6 });
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(600);
    return start;
  },

  // (6) hashscan, ~14s: the HCS topic's message list on HashScan (best effort, skipped after 20s).
  async hashscan(page, report) {
    await page.goto(`https://hashscan.io/testnet/topic/${TOPIC}/messages`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForFunction(() => /SEQ\.#/.test(document.body.innerText), null, { timeout: 20000 });
    const accept = page.getByRole("button", { name: /accept/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click({ timeout: 5000 }).catch(() => {});
      report.notes.push("cookie banner dismissed");
    }
    await prep(page);
    await page.waitForTimeout(1200);
    const start = Date.now();
    await page.waitForTimeout(2500);
    await scrollBy(page, 520, 4);
    await page.waitForTimeout(1200);
    await scrollBy(page, 620, 4);
    await page.waitForTimeout(1200);
    await scrollToBottom(page, 4);
    await page.waitForTimeout(1500);
    return start;
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(clips);
const browser = await launch();
const results = [];
for (const name of wanted) {
  if (!clips[name]) { console.error("unknown clip", name); continue; }
  log("recording", name);
  const r = await record(browser, name, clips[name]);
  log(name, r.ok ? "ok" : "FAILED", r.probe || "", r.notes.join(" | "));
  results.push(r);
}
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(JSON.stringify(results, null, 2));
