<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Contributing

Issues and pull requests are welcome.

- **No dependencies, no build step.** The files are plain JavaScript and CSS that a page loads as
  they are; keep it that way.
- **Run the tests** before a pull request: `npm install --no-save playwright`,
  `npx playwright install chromium-headless-shell firefox`, then `node test/e2e.mjs`. A new
  behaviour comes with a check in `test/e2e.mjs`.
- **The core is shared.** `vitrine-core.js` is the same file in
  [anefzaoui/vitrine](https://github.com/anefzaoui/vitrine) and
  [anefzaoui/vitrine-modal](https://github.com/anefzaoui/vitrine-modal). A change to it bumps its
  version and goes to both.
- **Every visible text** goes through `Vitrine.setStrings` (with an English default), every
  direction-bound style uses logical properties, and anything that moves respects
  `prefers-reduced-motion`.
- Each file starts with its version header and an `SPDX-License-Identifier: GPL-3.0-or-later` line.
  By contributing you agree to license your work under the GPL-3.0-or-later.
