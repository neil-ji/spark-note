#!/usr/bin/env node
/**
 * Extract plain-text manuscript from an HTML card deck.
 *
 * This is a FALLBACK tool — the primary workflow is:
 *   1. Write manuscript.txt (human-authored clean prose)
 *   2. Build HTML from it
 *   3. Screenshot HTML → PNGs
 *
 * Use this only when you have HTML but lost the original manuscript.
 * It skips UI chrome (badges, kickers, labels, pagers, tags) and extracts
 * only the meaningful prose from each card's content area.
 *
 * Usage:
 *   node extract-text.mjs <html-file> [output-file]
 *
 * Prerequisites: pnpm install (playwright comes via apps/web)
 */

import { readdirSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Resolve playwright: local node_modules first, then pnpm store fallback ──
function findPlaywrightMjs() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  let dir = resolve(__dirname);
  while (dir !== path.dirname(dir)) {
    const store = path.join(dir, 'node_modules', '.pnpm');
    if (existsSync(store)) {
      const pwDir = readdirSync(store).find(d => d.startsWith('playwright@'));
      if (pwDir) {
        const pwIndex = path.join(store, pwDir, 'node_modules', 'playwright', 'index.mjs');
        if (existsSync(pwIndex)) return pwIndex;
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error('playwright not found. Run "npm install playwright" from the project root (or "pnpm install" from spark-hub root).');
}

let chromium;
try {
  // Local node_modules (standalone install) — resolves relative to cwd
  ({ chromium } = await import('playwright'));
} catch {
  const playwrightPath = findPlaywrightMjs();
  ({ chromium } = await import(playwrightPath));
}

// Launch chromium. In macOS Seatbelt-sandboxed shells the default launch fails
// on Mach-port rendezvous; --single-process --no-zygote works. Try default first.
async function launchChromium() {
  try {
    return await chromium.launch();
  } catch (err) {
    console.error(`Default chromium launch failed (${err.message.split('\n')[0]}), retrying with --single-process --no-zygote`);
    return await chromium.launch({ args: ['--single-process', '--no-zygote'] });
  }
}

// ── UI chrome selectors to EXCLUDE from text extraction ──
const CHROME_SELECTORS = [
  '.weekly-badge',
  '.card-pager',
  '.page-footer-dots',
  '.page-kicker',
  '.page-series-marker',
  '.c-tag-strip',
  '.c-tag',
  '.c-insight-label',
  '.c-takeaway-num',
  '.kicker-dot',
  '.cover-issue',
  '.cover-meta',
  '.c-cta .tagline',
  '.c-next',
  '.page-header .sub',
];

// ── Main ──
async function main() {
  const htmlFile = process.argv[2];
  const outputFile = process.argv[3];

  if (!htmlFile) {
    console.error('Usage: node extract-text.mjs <html-file> [output-file]');
    process.exit(1);
  }

  const absHtml = resolve(htmlFile);
  if (!existsSync(absHtml)) {
    console.error(`HTML file not found: ${absHtml}`);
    process.exit(1);
  }

  const browser = await launchChromium();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 820, height: 600 });
  await page.goto(`file://${absHtml}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const cards = page.locator('.card');
  const cardCount = await cards.count();
  const sections = [];

  for (let i = 0; i < cardCount; i++) {
    const card = cards.nth(i);
    const isCover = await card.evaluate(el => el.classList.contains('cover'));

    // Hide all UI chrome elements before extracting text
    for (const sel of CHROME_SELECTORS) {
      const els = card.locator(sel);
      const count = await els.count();
      for (let j = 0; j < count; j++) {
        await els.nth(j).evaluate(el => { el.style.display = 'none'; });
      }
    }

    // Get text from the content area
    let text;
    if (isCover) {
      const coverContent = card.locator('.cover-content');
      if (await coverContent.count() > 0) {
        text = await coverContent.innerText();
      } else {
        text = await card.innerText();
      }
    } else {
      const pageBody = card.locator('.page-body');
      const pageHeader = card.locator('.page-header');
      let headerText = '';
      let bodyText = '';

      if (await pageHeader.count() > 0) {
        const h2 = pageHeader.locator('h2');
        if (await h2.count() > 0) {
          headerText = (await h2.innerText()).trim();
        }
      }
      if (await pageBody.count() > 0) {
        bodyText = (await pageBody.innerText()).trim();
      }

      text = [headerText, bodyText].filter(Boolean).join('\n\n');
    }

    // Clean up: collapse whitespace, fix formula artifacts
    const cleaned = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[→]\n/g, '→ ')
      .replace(/\n([→+])/g, ' $1')
      .trim();

    if (cleaned) {
      sections.push({ isCover, text: cleaned });
    }
  }

  await browser.close();

  // ── Assemble output ──
  const output = sections
    .map((s) => {
      if (s.isCover) {
        return s.text.replace(/^每周更新\n?/gm, '').trim();
      }
      return s.text;
    })
    .join('\n\n');

  if (outputFile) {
    writeFileSync(resolve(outputFile), output, 'utf-8');
    console.error(`Written to ${outputFile}`);
  } else {
    console.log(output);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
