import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { HtmlExportService } from './src/common/services/html-export.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const pdfService = app.get(HtmlExportService);
  
  const testHtml = `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script></head><body><h1>Test $$e=mc^2$$</h1></body></html>`;
  
  try {
    const start = Date.now();
    console.log("Starting PDF test...");
    const pdf = await pdfService.htmlToPdf(testHtml);
    console.log("Success! PDF size:", pdf.length, "bytes, took:", Date.now() - start, "ms");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await app.close();
  }
}

bootstrap();
