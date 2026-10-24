import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_ID = "phmjgadfbbagfjlfgcdloehdcoapiohf";
const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const apiUrl = process.env.API_URL ?? "http://localhost:5560";
const pageUrl = process.env.PAGE_URL ?? "https://playwright.dev/docs/intro";
const token = process.env.EXT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;

if (!token || !databaseUrl) {
  throw new Error("EXT_TOKEN and DATABASE_URL are required");
}

const results = [];

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` -> ${detail}`}`);
}

function sql(query) {
  return execFileSync("psql", [databaseUrl, "-tAc", query], { encoding: "utf8" }).trim();
}

function corsStatus(origin) {
  const out = execFileSync("curl", [
    "-s", "-o", "/dev/null", "-w", "%{http_code} %header{access-control-allow-origin}",
    "-X", "OPTIONS", `${apiUrl}/knowledge-sources`,
    "-H", `Origin: ${origin}`, "-H", "Access-Control-Request-Method: POST",
  ], { encoding: "utf8" });

  return out.trim();
}

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pa-ext-")), {
  headless: false,
  args: ["--headless=new", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

  check("extension id pinned by manifest key", worker.url().includes(EXTENSION_ID), worker.url());

  const page = await context.newPage();

  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });

  const selection = (await page.evaluate(() => {
    const p = [...document.querySelectorAll("article p")].find((el) => (el.textContent ?? "").length > 60);

    if (!p) {
      return "";
    }

    const range = document.createRange();

    range.selectNodeContents(p);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);

    return getSelection()?.toString() ?? "";
  })).concat(` [e2e ${Date.now()}]`);
  const pageTitle = await page.title();
  const livePageUrl = page.url().split("#")[0];

  check("selected real page text", selection.length > 60, `${selection.length} chars, title "${pageTitle}"`);

  await page.bringToFront();

  const setToken = (value) =>
    worker.evaluate(
      (t) => chrome.storage.local.set({ settings: { baseUrl: "http://localhost:5560", token: t } }),
      value,
    );

  const click = (text) =>
    worker.evaluate(
      async ({ text, pageUrl, pageTitle }) => {
        const tab = { id: 1, url: pageUrl, title: pageTitle };

        await chrome.action.setBadgeText({ text: "" });
        chrome.contextMenus.onClicked.dispatch(
          { menuItemId: "send-to-post-anki", selectionText: text, pageUrl: tab.url, editable: false },
          tab,
        );
      },
      { text, pageUrl: livePageUrl, pageTitle },
    );

  const badge = async () => {
    for (let i = 0; i < 100; i += 1) {
      const text = await worker.evaluate(() => chrome.action.getBadgeText({}));

      if (text !== "" && text !== "...") {
        const title = await worker.evaluate(() => chrome.action.getTitle({}));

        return { text, title };
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    return { text: "", title: "" };
  };

  const before = Number(sql("select count(*) from knowledge_sources"));

  await setToken("");
  await click(selection);

  const noToken = await badge();

  check("missing token -> ERR 401", noToken.text === "ERR" && noToken.title.includes("401"), `${noToken.text} / ${noToken.title}`);

  await setToken("pat_wrong");
  await click(selection);

  const badToken = await badge();

  check("wrong token -> ERR 401", badToken.text === "ERR" && badToken.title.includes("401"), `${badToken.text} / ${badToken.title}`);
  check("rejected requests stored nothing", Number(sql("select count(*) from knowledge_sources")) === before);

  await setToken(token);
  await click(selection);

  const ok = await badge();

  check("valid token -> OK badge", ok.text === "OK", `${ok.text} / ${ok.title}`);

  const row = sql(
    `select count(*) || '|' || coalesce(max(source_url),'') || '|' || coalesce(bool_and(raw_text like '%${pageTitle.replace(/'/g, "''")}%')::text,'') from knowledge_sources where source_url like '${livePageUrl}%' and raw_text like '%${selection.slice(-20).replace(/[\[\]]/g, "_")}%'`,
  );
  const [count, sourceUrl, hasTitle] = row.split("|");

  check("one row stored with page url", count === "1" && sourceUrl === livePageUrl, `rows=${count} source_url=${sourceUrl}`);
  check("page title stored in row text", hasTitle === "true");
  check("row total grew by 1", Number(sql("select count(*) from knowledge_sources")) === before + 1);

  await new Promise((r) => setTimeout(r, 4500));
  check("badge clears after 4s", (await worker.evaluate(() => chrome.action.getBadgeText({}))) === "");

  await click(selection);

  const dup = await badge();

  check("same selection again -> DUP badge, no new row", dup.text === "DUP" && Number(sql("select count(*) from knowledge_sources")) === before + 1, `${dup.text} / ${dup.title}`);

  const allowed = corsStatus(`chrome-extension://${EXTENSION_ID}`);
  const denied = corsStatus("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

  check("CORS preflight allows extension origin", allowed.endsWith(`chrome-extension://${EXTENSION_ID}`), allowed);
  check("CORS preflight denies other extension origin", !denied.includes("chrome-extension://"), denied);
} finally {
  await context.close();
}

const failed = results.filter((r) => !r.ok).length;

console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
