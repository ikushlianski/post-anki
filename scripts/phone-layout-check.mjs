// Usage: node scripts/phone-layout-check.mjs [--seed] [--shots] [--use-dev-app]
// Runs against the isolated stack (npm run e2e:stack:up, http://localhost:5550) and never against the dev app or dev database;
// --use-dev-app is a read-only look at the dev app and cannot be combined with --seed.
// Phone section (390x844): every key screen must show its landmark, must not overflow sideways and must hold no
// visible interactive element under 44px. Desktop section (1280x800): the dense desktop sizes must not have grown.
// Layers closed by default (menus, drawer, regenerate panel, decision strip) are opened and measured too; the opener
// must exist and the layer must appear or the run fails. The floating chat button only exists from 640px: below that
// it must be hidden and the menu entry must open the chat; from 640 to 1280px it must not cover any card field or button.
// Exit code is 0 only when nothing failed and nothing was left unverified.
// Without --seed the script only measures what is on screen. With --seed it adds one knowledge source through the UI
// to get pending cards. Afterwards, even when a section crashed, it deletes the feedback and extraction-grade rows of the
// sources it created (by source id) and clears extraction data on the isolated database only; it then asserts that none of its sources
// remain. It refuses to seed when the database already holds knowledge sources.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCheckTarget } from "./lib/stack-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "/Users/ikushlianski/work/verification-repo/node_modules/playwright-core");

const target = resolveCheckTarget({ argv: process.argv, env: process.env });

if (!target.ok) {
  console.log(`FAIL ${target.reason}`);
  process.exit(1);
}

const BASE = target.base;
const DB_CONTAINER = target.container;
const DB_NAME = target.database;
const SEED = process.argv.includes("--seed");
const SHOTS = process.argv.includes("--shots");
const SHOTS_DIR = path.join(root, "proof/phone-layout");
const LANDMARK_TIMEOUT_MS = 15000;
const SEED_TEXT =
  "Redis хранит данные в оперативной памяти, поэтому чтение занимает доли миллисекунды.\n\nTTL задаёт время жизни ключа, после которого Redis удаляет его сам.";

const SCREENS = [
  { name: "dashboard", url: "/", landmark: '[data-testid="subject-search-input"]' },
  { name: "add-knowledge", url: "/add-knowledge", landmark: '[data-testid="knowledge-add-form"]' },
  { name: "approve", url: "/knowledge-bit-review", landmark: '[data-testid^="knowledge-bit-review-item-"]', needsCards: true },
  { name: "review-question", url: "/knowledge/review", landmark: "main" },
  { name: "suspended", url: "/knowledge/suspended", landmark: "main" },
  { name: "subject-page", url: "/subject/__SUBJECT__", landmark: "main h1" },
  { name: "admin-settings", url: "/admin-settings", landmark: '[data-testid^="admin-settings-model-tier"]' },
  { name: "admin-compare-models", url: "/admin-compare-models", landmark: '[data-testid="model-comparison-excerpt"]' },
];

function measure({ minTarget, rootSelector }) {
  const scope = rootSelector ? document.querySelector(rootSelector) : document;

  if (!scope) {
    return { missing: true };
  }

  const interactive = "button, a[href], input, select, textarea, summary, [role='button'], [role='combobox']";
  const describe = (el) => {
    const id = el.getAttribute("data-testid");
    const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40);

    return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""} "${text}"`;
  };
  const small = [];
  let checked = 0;

  const candidates = scope === document ? [...document.querySelectorAll(interactive)] : [...(scope.matches(interactive) ? [scope] : []), ...scope.querySelectorAll(interactive)];

  for (const el of candidates) {
    const style = getComputedStyle(el);
    const label = (el.type === "checkbox" || el.type === "radio") && el.closest("label");
    const box = (label || el).getBoundingClientRect();

    if (style.visibility === "hidden" || style.display === "none" || box.width === 0 || box.height === 0) {
      continue;
    }

    if (el.type === "hidden" || (el.innerText || "").trim() === "Hide Error") {
      continue;
    }

    checked += 1;

    if (minTarget > 0 && (box.height < minTarget - 0.5 || box.width < minTarget - 0.5)) {
      small.push({ el: describe(el), w: Math.round(box.width), h: Math.round(box.height) });
    }
  }

  const wide = [];

  for (const el of document.querySelectorAll("body *")) {
    const box = el.getBoundingClientRect();

    if (box.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed") {
      wide.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${String(el.className).split(" ").slice(0, 3).join(".")} right=${Math.round(box.right)}`);
    }
  }

  return {
    checked,
    wide: wide.slice(0, 6),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    small,
  };
}

function lookupSubjectId() {
  const result = spawnSync(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-U", "postanki", "-d", DB_NAME, "-Atc", "select id from subjects where name='Business' limit 1"],
    { encoding: "utf8" },
  );

  return result.stdout.trim();
}

async function seedCards(page) {
  await page.goto(`${BASE}/add-knowledge`);
  await page.getByTestId("knowledge-block-input-0").waitFor({ timeout: LANDMARK_TIMEOUT_MS });
  await page.getByTestId("knowledge-block-input-0").fill(SEED_TEXT);
  await page.getByTestId("knowledge-model-select").click();
  await page.getByTestId("knowledge-model-select-list").locator('[role="option"]').first().click();
  await page.getByTestId("knowledge-submit-button").click();
  await page.getByTestId("knowledge-success-message").waitFor({ timeout: 30000 });
  await page.goto(`${BASE}/knowledge-bit-review`);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="knowledge-bit-review-item-"]').length > 0, null, { timeout: 150000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Writing cards"), null, { timeout: 150000 });
  await page.waitForTimeout(1500);
}

let failures = 0;
const unverified = [];

function fail(message) {
  failures += 1;
  console.log(`       ${message}`);
}

async function openScreen(page, screen, subjectId) {
  const url = screen.url.replace("__SUBJECT__", subjectId);
  const response = await page.goto(`${BASE}${url}`);

  if (!response || !response.ok()) {
    return { ok: false, reason: `page answered ${response ? response.status() : "nothing"}` };
  }

  try {
    await page.locator(screen.landmark).first().waitFor({ timeout: LANDMARK_TIMEOUT_MS });
  } catch {
    return { ok: false, reason: `landmark not found: ${screen.landmark}`, missingCards: screen.needsCards === true };
  }

  await page.waitForTimeout(1500);

  return { ok: true };
}

async function runSection(browser, title, viewport, minTarget, screens, subjectId, extra) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: false, hasTouch: true });
  const page = await context.newPage();

  console.log(`\n== ${title} (${viewport.width}x${viewport.height}) ==`);

  for (const screen of screens) {
    const opened = await openScreen(page, screen, subjectId);

    if (!opened.ok) {
      if (opened.missingCards) {
        unverified.push("approve cards");
        console.log(`NOT VERIFIED ${screen.name.padEnd(22)} no pending card on screen (run with --seed)`);
        failures += 1;
      } else {
        console.log(`FAIL ${screen.name.padEnd(22)} ${opened.reason}`);
        failures += 1;
      }

      continue;
    }

    const result = await page.evaluate(measure, { minTarget });
    const problems = result.overflow || result.small.length > 0 || result.checked === 0;

    console.log(`${problems ? "FAIL" : "ok  "} ${screen.name.padEnd(22)} width ${result.scrollWidth}/${result.innerWidth}${result.overflow ? " OVERFLOW" : ""} measured:${result.checked} small:${result.small.length}`);

    if (result.checked === 0) {
      fail("measured 0 interactive elements");
    }

    if (result.overflow) {
      failures += 1;

      for (const item of result.wide) {
        console.log(`       wide: ${item}`);
      }
    }

    for (const item of result.small) {
      fail(`${item.w}x${item.h}  ${item.el}`);
    }

    if (extra) {
      await extra(page, screen);
    }

    if (SHOTS && minTarget > 0) {
      await page.screenshot({ path: path.join(SHOTS_DIR, `${screen.name}.png`), fullPage: true });
    }
  }

  await context.close();
}

const LAYER_OPEN_TIMEOUT_MS = 6000;

async function measureLayer(page, name, layer) {
  const marker = `layer ${name}`.padEnd(30);

  try {
    await layer.open(page);
    await page.locator(layer.root).first().waitFor({ state: "visible", timeout: LAYER_OPEN_TIMEOUT_MS });
  } catch (error) {
    console.log(`FAIL ${marker} could not open: ${String(error.message).split("\n")[0]}`);
    failures += 1;

    return;
  }

  await page.waitForTimeout(400);

  const result = await page.evaluate(measure, { minTarget: 44, rootSelector: layer.root });
  const problems = result.missing || result.overflow || result.small.length > 0 || result.checked === 0;

  console.log(`${problems ? "FAIL" : "ok  "} ${marker} width ${result.scrollWidth}/${result.innerWidth}${result.overflow ? " OVERFLOW" : ""} measured:${result.checked} small:${result.small?.length ?? 0}`);

  if (result.missing) {
    fail("layer root vanished before it could be measured");
  } else {
    if (result.checked === 0) {
      fail("measured 0 interactive elements in the layer");
    }

    if (result.overflow) {
      failures += 1;
    }

    for (const item of result.small) {
      fail(`${item.w}x${item.h}  ${item.el}`);
    }
  }

  if (layer.close) {
    try {
      await layer.close(page);
      await page.waitForTimeout(300);
    } catch (error) {
      fail(`could not close the layer: ${String(error.message).split("\n")[0]}`);
    }
  }
}

const closeMenuWithEscape = async (page) => {
  await page.keyboard.press("Escape");
  await page.locator('div[aria-label^="Actions for"]').first().waitFor({ state: "hidden", timeout: LAYER_OPEN_TIMEOUT_MS });
};

async function closeDrawerWithBackdrop(page) {
  const backdrop = page.locator("div.fixed.inset-0.z-30");

  if ((await backdrop.count()) === 0) {
    throw new Error("the navigation drawer has no backdrop to close it with");
  }

  await backdrop.first().click({ position: { x: 350, y: 400 }, timeout: LAYER_OPEN_TIMEOUT_MS });
}

const LAYERS = {
  dashboard: [
    ["dashboard row menu", {
      root: 'div[aria-label^="Actions for"]',
      open: (page) => page.locator('[data-testid^="subject-menu-button-"]').first().click({ timeout: LAYER_OPEN_TIMEOUT_MS }),
      close: closeMenuWithEscape,
    }],
    ["navigation drawer", {
      root: "div.fixed.inset-y-0.left-0",
      open: (page) => page.getByTestId("mobile-nav-toggle").click({ timeout: LAYER_OPEN_TIMEOUT_MS }),
      close: closeDrawerWithBackdrop,
    }],
  ],
  "add-knowledge": [
    ["add-knowledge model select", { root: '[data-testid="knowledge-model-select"]', open: async () => {} }],
  ],
  approve: [
    ["regenerate confirm panel", {
      root: '[data-testid$="-confirm-panel"]',
      open: (page) => page.locator('button[data-testid^="knowledge-bit-review-regenerate-ks_"]').first().click({ timeout: LAYER_OPEN_TIMEOUT_MS }),
      close: (page) => page.locator('[data-testid$="-cancel"]').first().click({ timeout: LAYER_OPEN_TIMEOUT_MS }),
    }],
  ],
  "subject-page": [
    ["subject header menu", {
      root: 'div[aria-label^="Actions for"]',
      open: (page) => page.getByTestId("subject-header-menu-button").click({ timeout: LAYER_OPEN_TIMEOUT_MS }),
      close: closeMenuWithEscape,
    }],
  ],
  "admin-compare-models": [
    ["compare model picker list", { root: '[data-testid="model-comparison-picker"]', open: async () => {} }],
  ],
};

const DECISION_STRIP = {
  root: '[data-testid="knowledge-bit-review-decision-strip"]',
  open: (page) => page.locator('[data-testid^="knowledge-bit-review-item-"]').first().getByRole("button", { name: "Reject", exact: true }).click({ timeout: LAYER_OPEN_TIMEOUT_MS }),
  close: async (page) => {
    await page.locator('[data-testid="knowledge-bit-review-decision-undo"]').click({ timeout: LAYER_OPEN_TIMEOUT_MS });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="knowledge-bit-review-item-"]').length > 0, null, { timeout: LAYER_OPEN_TIMEOUT_MS });
  },
};

function overlapProbe() {
  const chat = document.querySelector('[data-testid="global-card-chat-open"]');

  if (!chat) {
    return { missing: true };
  }

  const a = chat.getBoundingClientRect();
  const hits = [];
  const top = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);

  if (!top || (top !== chat && !chat.contains(top))) {
    hits.push(`the chat button itself is covered by ${top ? top.tagName.toLowerCase() : "nothing"}`);
  }

  for (const el of document.querySelectorAll('[data-testid^="knowledge-bit-review-item-"] textarea, [data-testid^="knowledge-bit-review-item-"] button, [data-testid^="knowledge-bit-review-source-"] button, [data-testid^="knowledge-bit-review-source-"] a')) {
    const b = el.getBoundingClientRect();

    if (b.width === 0 || b.height === 0) {
      continue;
    }

    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
      hits.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || el.id || "").trim().replace(/\s+/g, " ").slice(0, 30)}"`);
    }
  }

  return { hits };
}

const CHAT_BUTTON = '[data-testid="global-card-chat-open"]';
const CHAT_VISIBLE_FROM = 640;

async function chatButtonOverlap(page, width) {
  const visible = await page.evaluate((selector) => {
    const el = document.querySelector(selector);

    if (!el) {
      return { found: false };
    }

    const box = el.getBoundingClientRect();

    return { found: true, shown: getComputedStyle(el).display !== "none" && box.width > 0 && box.height > 0 };
  }, CHAT_BUTTON);
  const label = `chat button overlap @${width}`.padEnd(30);

  if (!visible.found || !visible.shown) {
    console.log(`FAIL ${label} the button has no size at a width where it must be visible, so the probe would be vacuous`);
    failures += 1;

    return;
  }

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const view = await page.evaluate(() => window.innerHeight);
  const hits = new Set();

  for (let y = 0; y < height; y += Math.max(200, view / 2)) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);

    const probe = await page.evaluate(overlapProbe);

    if (probe.missing) {
      fail("floating chat button not found for the overlap check");

      return;
    }

    probe.hits.forEach((hit) => hits.add(hit));
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  console.log(`${hits.size === 0 ? "ok  " : "FAIL"} ${label} fields or buttons covered: ${hits.size}`);

  for (const hit of hits) {
    fail(`chat button covers ${hit}`);
  }
}

async function chatHiddenOnPhone(page) {
  const label = "chat button on phone".padEnd(30);
  const state = await page.evaluate((selector) => {
    const el = document.querySelector(selector);

    if (!el) {
      return "absent";
    }

    return getComputedStyle(el).display === "none" || el.getBoundingClientRect().width === 0 ? "hidden" : "visible";
  }, CHAT_BUTTON);

  if (state === "absent") {
    console.log(`FAIL ${label} the floating button is not in the page at all; it must be present and hidden below ${CHAT_VISIBLE_FROM}px`);
    failures += 1;

    return;
  }

  if (state === "visible") {
    console.log(`FAIL ${label} the floating button is visible below ${CHAT_VISIBLE_FROM}px; the phone overlap check must measure it`);
    failures += 1;

    return;
  }

  try {
    await page.getByTestId("mobile-nav-toggle").click({ timeout: LAYER_OPEN_TIMEOUT_MS });

    const entry = page.locator("div.fixed.inset-y-0.left-0").getByTestId("nav-ask-my-cards");

    await entry.waitFor({ state: "visible", timeout: LAYER_OPEN_TIMEOUT_MS });

    const box = await entry.boundingBox();

    if (!box || box.height < 43.5) {
      fail(`Ask my cards menu entry is ${box ? Math.round(box.height) : "missing"}px high, needs 44`);

      return;
    }

    await entry.click({ timeout: LAYER_OPEN_TIMEOUT_MS });
    await page.getByTestId("global-card-chat-panel").waitFor({ state: "visible", timeout: LAYER_OPEN_TIMEOUT_MS });
    console.log(`ok   ${label} hidden below ${CHAT_VISIBLE_FROM}px; reachable through the menu entry (${Math.round(box.width)}x${Math.round(box.height)}) which opens the chat panel`);
    await page.getByTestId("global-card-chat-close").click({ timeout: LAYER_OPEN_TIMEOUT_MS });
  } catch (error) {
    console.log(`FAIL ${label} menu entry check failed: ${String(error.message).split("\n")[0]}`);
    failures += 1;
  }
}

async function chatOverlapSection(browser, subjectId) {
  const approve = SCREENS.find((screen) => screen.name === "approve");

  for (const width of [640, 700, 768, 1024, 1280]) {
    console.log(`\n== chat button overlap (${width}x900) ==`);

    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
    const page = await context.newPage();
    const opened = await openScreen(page, approve, subjectId);

    if (!opened.ok) {
      unverified.push(`chat button overlap at ${width}px (no pending card: run with --seed)`);
      console.log(`NOT VERIFIED ${"approve".padEnd(22)} ${opened.reason}`);
      failures += 1;
    } else {
      await chatButtonOverlap(page, width);
    }

    await context.close();
  }
}

async function phoneLayers(page, screen) {
  for (const [name, layer] of LAYERS[screen.name] ?? []) {
    await measureLayer(page, name, layer);
  }

  if (screen.name !== "approve") {
    return;
  }

  if (SEED) {
    await measureLayer(page, "decision strip after Reject", DECISION_STRIP);
  } else {
    unverified.push("decision strip after Reject (presses Reject and Undo on real cards: needs --seed)");
    console.log(`NOT VERIFIED ${"decision strip".padEnd(22)} needs --seed`);
    failures += 1;
  }

  await chatHiddenOnPhone(page);
}

async function desktopControls(page, screen) {
  if (screen.name !== "dashboard") {
    return;
  }

  const sizeOf = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();

    return box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
  };
  const checks = [
    { name: "subject grip width <= 32", selector: '[data-testid^="subject-drag-handle-"]', pass: (b) => b.w <= 32 },
    { name: "subject chevron width <= 32", selector: '[data-testid^="subject-toggle-"]', pass: (b) => b.w <= 32 },
    { name: "subject search height <= 38", selector: '[data-testid="subject-search-input"]', pass: (b) => b.h <= 38 },
    { name: "chat button is a 44x44 round icon", selector: '[data-testid="global-card-chat-open"]', pass: (b) => b.w >= 43.5 && b.w <= 44.5 && b.h >= 43.5 && b.h <= 44.5 },
    { name: "row menu button <= 32x32", selector: '[data-testid^="subject-menu-"], [aria-label="Subject actions"], [aria-haspopup="menu"]', pass: (b) => b.w <= 32 && b.h <= 32 },
  ];

  await page.locator('[data-testid="subject-search-input"]').fill("a");
  await page.waitForTimeout(800);

  const clear = await sizeOf('[aria-label*="lear"]');

  if (clear) {
    checks.push({ name: "search clear button <= 32x32", measured: clear, pass: (b) => b.w <= 32 && b.h <= 32 });
  }

  await page.locator('[data-testid="subject-search-input"]').fill("");
  await page.waitForTimeout(500);

  for (const check of checks) {
    const measured = check.measured ?? (await sizeOf(check.selector));

    if (!measured) {
      fail(`desktop control not found: ${check.name}`);
    } else if (check.pass(measured)) {
      console.log(`       ok  ${check.name} (${measured.w}x${measured.h})`);
    } else {
      fail(`desktop control grew: ${check.name} (${measured.w}x${measured.h})`);
    }
  }
}

const subjectId = lookupSubjectId();

if (!subjectId) {
  console.log("FAIL could not read the Business subject id from the database; the subject page cannot be checked");
  process.exit(1);
}

if (SHOTS) {
  mkdirSync(SHOTS_DIR, { recursive: true });
}

function psql(sql) {
  const result = spawnSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postanki", "-d", DB_NAME, "-Atc", sql], { encoding: "utf8" });

  return { ok: result.status === 0, out: result.stdout.trim() };
}

function listSourceIds() {
  const result = psql("select id from knowledge_sources order by id");

  if (!result.ok) {
    throw new Error("could not list knowledge sources: the database query failed");
  }

  return result.out ? result.out.split("\n") : [];
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

function cleanupSeeded(sourcesBefore) {
  let seeded;

  try {
    seeded = listSourceIds().filter((id) => !sourcesBefore.has(id));
  } catch (error) {
    console.log(`FAIL cleanup could not run: ${error.message}`);
    failures += 1;

    return;
  }

  if (seeded.some((id) => !SAFE_ID.test(id))) {
    console.log("FAIL a seeded source id has an unexpected shape; nothing was deleted");
    failures += 1;

    return;
  }

  if (seeded.length > 0) {
    const list = seeded.map((id) => `'${id}'`).join(",");
    const counted = (table) => {
      const result = psql(`with d as (delete from ${table} where knowledge_source_id in (${list}) returning 1) select count(*) from d`);

      return result.ok ? Number(result.out) : null;
    };
    const feedback = counted("knowledge_bit_feedback");
    const grades = counted("knowledge_source_extraction_grade");

    console.log(`cleanup: deleted ${feedback ?? "?"} feedback row(s) and ${grades ?? "?"} extraction-grade row(s) that belong to the ${seeded.length} seeded source(s)`);

    if (feedback === null || grades === null) {
      console.log("FAIL could not delete the feedback or grade rows of the seeded sources");
      failures += 1;
    }
  } else {
    console.log("cleanup: no seeded source found");
  }

  const cleared = spawnSync("bash", ["scripts/clear-extraction-data.sh"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CLEAR_DB_CONTAINER: DB_CONTAINER, CLEAR_DB_NAME: DB_NAME },
  });

  console.log(cleared.stdout.trim().split("\n").pop());

  let left;

  try {
    left = listSourceIds().filter((id) => seeded.includes(id));
  } catch (error) {
    console.log(`FAIL cleanup self-check could not run: ${error.message}`);
    failures += 1;

    return;
  }

  if (left.length > 0) {
    console.log(`FAIL ${left.length} source(s) created by this run still exist after cleanup`);
    failures += 1;
  } else {
    console.log("ok   cleanup self-check: no source created by this run remains");
  }
}

const browser = await chromium.launch({ headless: true });
let sourcesBefore = new Set();

if (SEED) {
  try {
    sourcesBefore = new Set(listSourceIds());
  } catch (error) {
    console.log(`FAIL ${error.message}`);
    process.exit(1);
  }
}

if (SEED && sourcesBefore.size > 0) {
  console.log(`FAIL refusing to seed: the database already holds ${sourcesBefore.size} knowledge source(s) and the cleanup would remove them. Measure without --seed or reset the isolated stack (npm run e2e:stack:down, then up).`);
  await browser.close();
  process.exit(1);
}

try {
  if (SEED) {
    console.log("WARNING: --seed adds one knowledge source, removes the feedback and extraction-grade rows of that source afterwards, and clears extraction data on the isolated database only (sources and cards; the grades of other sources are kept).");

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    try {
      await seedCards(await context.newPage());
    } catch (error) {
      console.log(`FAIL seeding pending cards failed: ${String(error.message).split("\n")[0]}`);
      failures += 1;
      throw error;
    } finally {
      await context.close();
    }
  } else {
    console.log("Not seeding: measuring only what is on screen now (use --seed to create pending cards).");
  }

  await runSection(browser, "phone", { width: 390, height: 844 }, 44, SCREENS, subjectId, phoneLayers);
  await chatOverlapSection(browser, subjectId);
  await runSection(
    browser,
    "desktop",
    { width: 1280, height: 800 },
    0,
    SCREENS.filter((screen) => screen.name === "dashboard"),
    subjectId,
    desktopControls,
  );
} catch (error) {
  console.log(`FAIL run aborted: ${String(error.message).split("\n")[0]}`);
  failures += 1;
} finally {
  await browser.close();

  if (SEED) {
    cleanupSeeded(sourcesBefore);
  }
}

for (const item of unverified) {
  console.log(`NOT VERIFIED: ${item}`);
}

console.log(failures === 0 && unverified.length === 0 ? "\nPASS: phone, chat overlap and desktop sections verified" : `\nFAIL: ${failures} problem(s), ${unverified.length} unverified`);
process.exit(failures === 0 && unverified.length === 0 ? 0 : 1);
