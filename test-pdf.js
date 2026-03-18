const puppeteer = require('puppeteer');
const fs = require('fs');

async function test() {
  let executablePath;
  if (process.platform === 'darwin') {
      const paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }
  }
  console.log("Executable path:", executablePath);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    console.log("Browser launched successfully");
    const page = await browser.newPage();
    console.log("Page opened successfully");
    await browser.close();
  } catch (e) {
    console.error("Error launching browser:", e);
  }
}

test();
