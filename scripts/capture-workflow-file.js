const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outputPath = path.resolve(__dirname, '../public/screenshots/ci_cd_pipeline.png');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await page.goto('https://github.com/Debjit2821/Stellar-pay_V2/blob/main/.github/workflows/deploy.yml', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();
  console.log(`Saved workflow screenshot to ${outputPath}`);
})();