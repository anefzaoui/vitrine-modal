// SPDX-License-Identifier: GPL-3.0-or-later
// Vitrine modal in real headless browsers: its test page (test/fixture.html) at phone, tablet and
// desktop widths, light and dark, left to right and right to left, with reduced motion and by
// keyboard.
//
//   npm install --no-save playwright && npx playwright install chromium-headless-shell firefox
//   node test/e2e.mjs [--browsers=chromium,firefox] [--widths=360,1280] [--verbose]
//
// (or point PLAYWRIGHT_DIR at any playwright package folder). Checks, per browser: a modal opens,
// locks the page without moving it (a sticky header on a body with overflow-x: hidden, a fixed
// element, a heading), never lets it scroll sideways; a modal opens over a modal and Escape closes
// only the top one, the focus going back to what opened it; a form's method="dialog" closes it with
// its value; a click on the backdrop closes it; data-dismiss="" keeps it open on both; the phone
// sheet sits on the bottom edge; Back closes the top modal and stays on the page; no script errors;
// reduced motion (no movement); keyboard only; the accessibility tree.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));

// The static server runs in a process of its own (`--serve`), so a busy driver never starves it.
if (args.serve) {
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
  const srv = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { "content-type": "text/html" }).end("<!doctype html><title>Not here</title><p>404"); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
    });
  });
  srv.listen(0, "127.0.0.1", () => console.log(srv.address().port));
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();
} else {
const PW = process.env.PLAYWRIGHT_DIR;
const pw = PW ? await import(pathToFileURL(path.join(PW, "index.mjs")).href) : await import("playwright");
const browsers = (args.browsers || "chromium,firefox").split(",");
const server = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve"], { stdio: ["pipe", "pipe", "inherit"] });
const port = await new Promise((r) => server.stdout.once("data", (d) => r(String(d).trim())));
const BASE = `http://127.0.0.1:${port}/test/fixture.html`;

let failed = 0;
const rows = [];
function check(name, ok, info = "") {
  rows.push([ok ? "ok" : "FAIL", name, info]);
  if (!ok) failed++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settled = () => wait(450);

async function state(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    return {
      modals: [...document.querySelectorAll("dialog.vitrine-modal[open]")].map((m) => m.id),
      focus: a ? (a.id || a.tagName) : "",
      inside: !!(a && a.closest("dialog")),
      locked: document.documentElement.classList.contains("vitrine-locked"),
      sideways: document.scrollingElement.scrollWidth - document.documentElement.clientWidth,
      errors: window.VITRINE_ERRORS.slice(),
      url: location.href,
    };
  });
}
async function marks(page) {
  return page.evaluate(() => ["hdr", "fixed"].map((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return [r.left, r.top, r.width].map((v) => Math.round(v * 10) / 10).join(",");
  }).concat([(() => { const r = document.querySelector("h1").getBoundingClientRect(); return r.left + "," + r.width; })()]).join(" | "));
}
async function open(page) {
  await page.waitForFunction(() => window.Vitrine && Vitrine.modal, null, { timeout: 30000 });
}

async function run(name) {
  const browser = await pw[name].launch();
  const sizes = [[360, 740], [390, 844], [768, 1024], [1280, 800], [1440, 900]].filter(([w]) => !args.widths || args.widths.split(",").includes(String(w)));
  for (const [w, h] of sizes) {
    for (const variant of ["", "?dark", "?rtl", "?rtl&dark"]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
      const page = await ctx.newPage();
      page.setDefaultTimeout(5000);
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      const tag = `${name} ${w}x${h}${variant || " light"}`;
      try {
        await page.goto(BASE + variant, { timeout: 60000 });
        await open(page);
        await page.evaluate(() => window.scrollTo(0, 120));
        const before = await marks(page);
        await page.click("#open-m1");
        await settled();
        let s = await state(page);
        check(`${tag}: opens, focus inside`, s.modals.join() === "m1" && s.locked && s.inside, `${s.modals} ${s.focus}`);
        check(`${tag}: nothing moved on lock`, before === (await marks(page)), before);
        check(`${tag}: no sideways scroll`, s.sideways <= 0, String(s.sideways));
        await page.click("#open-m2");
        await settled();
        check(`${tag}: modal over modal`, (await state(page)).modals.join() === "m1,m2");
        await page.keyboard.press("Escape");
        await settled();
        s = await state(page);
        check(`${tag}: Escape closes the top one, focus back`, s.modals.join() === "m1" && s.focus === "open-m2" && s.locked, `${s.modals} ${s.focus}`);
        await page.click("#open-m2");
        await settled();
        const value = await page.evaluate(() => new Promise((r) => {
          document.getElementById("m2").addEventListener("vitrine:close", (e) => r(e.detail), { once: true });
          document.getElementById("close-m2").click();
        }));
        await settled();
        check(`${tag}: method="dialog" closes with its value`, value === "done" && (await state(page)).modals.join() === "m1", String(value));
        await page.mouse.click(4, h / 2);
        await settled();
        s = await state(page);
        const after = await marks(page);
        check(`${tag}: backdrop closes, focus back, unlocked`, s.modals.length === 0 && !s.locked && s.focus === "open-m1", `${s.modals} ${s.focus}`);
        check(`${tag}: nothing moved after`, before === after, `${before} -> ${after}`);
        await page.click("#open-m4");
        await settled();
        await page.keyboard.press("Escape");
        await page.mouse.click(4, h / 2);
        await settled();
        check(`${tag}: data-dismiss="" ignores Escape and backdrop`, (await state(page)).modals.join() === "m4");
        await page.click("#close-m4");
        await settled();
        check(`${tag}: its button closes it`, (await state(page)).modals.length === 0);
        await page.click("#open-m3");
        await settled();
        const sheet = await page.evaluate(() => { const r = document.getElementById("m3").getBoundingClientRect(); return [Math.round(r.bottom), Math.round(r.width)]; });
        if (w <= 640) check(`${tag}: sheet sits on the bottom edge`, Math.abs(sheet[0] - h) <= 1 && sheet[1] === w, sheet.join());
        await page.goBack();
        await settled();
        s = await state(page);
        check(`${tag}: Back closes it, stays on the page`, s.modals.length === 0 && !s.locked && s.url.startsWith(BASE), s.url);
        s = await state(page);
        check(`${tag}: no script errors`, errs.length === 0 && s.errors.length === 0, errs.concat(s.errors).join(" / "));
      } catch (e) {
        check(`${tag}: ran to the end`, false, e.message.split("\n")[0]);
      }
      await ctx.close();
    }
  }

  // Reduced motion: no movement, only a fade.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE, { timeout: 60000 });
    await open(page);
    await page.click("#open-m1");
    const t = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById("m1")); return [cs.transitionProperty, cs.transform]; });
    check(`${name} reduced motion: no movement`, !/transform/.test(t[0]) && t[1] === "none", t.join(" | "));
    await ctx.close();
  }

  // Keyboard only, and the accessibility tree.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { timeout: 60000 });
    await open(page);
    let id = "";
    for (let i = 0; i < 6 && id !== "open-m1"; i++) { await page.keyboard.press("Tab"); id = await page.evaluate(() => document.activeElement.id); }
    await page.keyboard.press("Enter");
    await settled();
    let s = await state(page);
    check(`${name} keyboard: Tab, Enter opens, focus inside`, id === "open-m1" && s.modals.join() === "m1" && s.inside, `${id} ${s.focus}`);
    const tree = await page.locator("#m1").ariaSnapshot();
    check(`${name} accessibility tree`, /dialog "Small"/.test(tree), tree.replace(/\n/g, " ⏎ "));
    await page.keyboard.press("Escape");
    await settled();
    s = await state(page);
    check(`${name} keyboard: Escape, focus back`, s.modals.length === 0 && s.focus === "open-m1", s.focus);
    await ctx.close();
  }
  await browser.close();
}

try {
  for (const b of browsers) await run(b);
} finally {
  server.stdin.end();
  server.kill();
}
for (const r of rows) if (r[0] !== "ok" || args.verbose) console.log(r.join("  "));
console.log(`${rows.length - failed} of ${rows.length} checks passed`);
process.exit(failed ? 1 : 0);
}
