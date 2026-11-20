// SPDX-License-Identifier: GPL-3.0-or-later
// vitrine-core.js ships, byte for byte, in both anefzaoui/vitrine and anefzaoui/vitrine-modal, so
// either library works alone and both together share one core. This compares this repository's
// copy with the other's main branch: the same version must be the same bytes; a newer version here
// is fine while the other repository catches up (a notice says so).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "vitrine-core.js");
const other = "https://raw.githubusercontent.com/anefzaoui/vitrine/main/vitrine-core.js";
const norm = (t) => t.replace(/\r\n/g, "\n");
const version = (t) => (t.match(/^\/\*! Vitrine core v(\d+\.\d+\.\d+)/) || [])[1];
const sha = (t) => crypto.createHash("sha256").update(norm(t)).digest("hex");
const mine = fs.readFileSync(here, "utf8");
const res = await fetch(other);
if (!res.ok) { console.log(`::notice::${other}: HTTP ${res.status}, not compared`); process.exit(0); }
const theirs = await res.text();
if (version(mine) === version(theirs)) {
  if (sha(mine) !== sha(theirs)) {
    console.error(`vitrine-core.js ${version(mine)} differs from anefzaoui/vitrine's: the same version must be the same file (bump the version when the core changes)`);
    process.exit(1);
  }
  console.log(`vitrine-core.js ${version(mine)}: identical to anefzaoui/vitrine's`);
} else {
  console.log(`::notice::vitrine-core.js here is ${version(mine)}, anefzaoui/vitrine has ${version(theirs)}: sync them`);
}
