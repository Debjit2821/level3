const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outputPath = path.resolve(__dirname, '../public/screenshots/ci_cd_pipeline.png');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  await page.goto('https://github.com/Debjit2821/Stellar-pay_V2/actions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('body').screenshot({ path: outputPath, fullPage: true });
  await browser.close();
  console.log(`Saved screenshot to ${outputPath}`);
})();