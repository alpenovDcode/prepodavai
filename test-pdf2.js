const puppeteer = require('puppeteer');

async function test() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
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
