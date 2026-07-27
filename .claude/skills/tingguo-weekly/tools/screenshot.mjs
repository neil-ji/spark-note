#!/usr/bin/env node
/**
 * HTML card deck → per-card PNGs + full-page PNG.
 *
 * Usage:
 *   node screenshot.mjs <html-file> <output-dir>
 *
 * Output (for a 5-card deck):
 *   output-dir/cover.png       first .card.cover element
 *   output-dir/card-02.png     2nd card
 *   output-dir/card-03.png     3rd card
 *   output-dir/card-04.png     4th card
 *   output-dir/card-05.png     5th card
 *   output-dir/full.png        full-page scroll capture
 *
 * Prerequisites: pnpm install (playwright comes via apps/web)
 */

import { readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Auto-resolve playwright from pnpm store ──
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
  throw new Error('playwright not found. Run "pnpm install" from spark-hub root.');
}

const playwrightPath = findPlaywrightMjs();
const { chromium } = await import(playwrightPath);

// ── Main ──
async function main() {
  const htmlFile = process.argv[2];
  const outputDir = process.argv[3];

  if (!htmlFile || !outputDir) {
    console.error('Usage: node screenshot.mjs <html-file> <output-dir>');
    process.exit(1);
  }

  const absHtml = resolve(htmlFile);
  const absOut = resolve(outputDir);

  if (!existsSync(absHtml)) {
    console.error(`HTML file not found: ${absHtml}`);
    process.exit(1);
  }

  mkdirSync(absOut, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 820, height: 600 });

  console.log(`Loading: file://${absHtml}`);
  await page.goto(`file://${absHtml}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // ── Per-card screenshots ──
  const cards = page.locator('.card');
  const cardCount = await cards.count();
  console.log(`Found ${cardCount} cards`);

  for (let i = 0; i < cardCount; i++) {
    const card = cards.nth(i);
    const isCover = await card.evaluate(el => el.classList.contains('cover'));
    const name = isCover ? 'cover.png' : `card-0${i + 1}.png`;
    const outPath = `${absOut}/${name}`;
    await card.screenshot({ path: outPath, type: 'png' });
    console.log(`  → ${name}`);
  }

  // ── Full-page screenshot ──
  await page.screenshot({ path: `${absOut}/full.png`, fullPage: true, type: 'png' });
  console.log('  → full.png');

  await browser.close();
  console.log(`Done — ${cardCount + 1} files written to ${absOut}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
