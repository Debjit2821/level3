const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.resolve(__dirname, '../public/demo');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 720 } }
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const navLinks = ['Dashboard', 'Activity', 'Analytics', 'Settings', 'Transactions'];
  for (const text of navLinks) {
    try {
      await page.click(`text=${text}`, { timeout: 6000 });
      await page.waitForTimeout(1500);
    } catch (error) {
      // ignore missing nav items if not present
    }
  }

  await page.waitForTimeout(1200);
  await page.close();
  await browser.close();

  const videos = fs.readdirSync(outDir).filter((file) => file.endsWith('.webm'));
  if (videos.length === 0) {
    console.error('No demo video file was generated.');
    process.exit(1);
  }

  const latestVideo = videos.sort().pop();
  const finalPath = path.join(outDir, 'demo-video.webm');
  fs.renameSync(path.join(outDir, latestVideo), finalPath);
  console.log(`Demo video saved to ${finalPath}`);
})();
