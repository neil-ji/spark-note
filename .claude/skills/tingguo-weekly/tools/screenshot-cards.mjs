import { chromium } from 'playwright';

const htmlPath = 'file://' + process.cwd() + '/docs/reports/xiaohongshu-agent-insights-2026-07-26.html';
const outDir = process.cwd() + '/docs/reports';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(htmlPath, { waitUntil: 'networkidle' });

const cards = await page.locator('.card').all();
console.log(`Found ${cards.length} cards`);

for (let i = 0; i < cards.length; i++) {
  const box = await cards[i].boundingBox();
  if (!box) { console.log(`Card ${i + 1}: no bounding box`); continue; }
  const pad = 10;
  const outPath = `${outDir}/page-${i + 1}.png`;
  await page.screenshot({
    path: outPath,
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
    omitBackground: false,
  });
  console.log(`Saved ${outPath} (${Math.round(box.width)}×${Math.round(box.height)})`);
}

await browser.close();
console.log('Done — 5 pages exported.');
