import { Injectable } from '@nestjs/common';
import { LOGO_BASE64 } from '../../modules/generations/generation.constants';

@Injectable()
export class HtmlPostprocessorService {
  private readonly MATHJAX_SCRIPT = `<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true
  },
  options: {
    ignoreHtmlClass: 'tex2jax_ignore',
    processHtmlClass: 'tex2jax_process'
  },
  startup: {
    ready: () => {
      window.MathJax.startup.defaultReady();
      window.MathJax.startup.promise.then(() => {
        console.log('MathJax initial typesetting complete');
      });
    }
  },
  svg: {
    fontCache: 'global'
  }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

  /**
   * Process HTML to ensure all requirements are met:
   * 1. Replace LOGO_PLACEHOLDER with actual base64 logo
   * 2. Ensure MathJax script is present if formulas are detected
   * 3. Clean up any markdown formatting if present
   */
  process(html: string): string {
    if (!html || typeof html !== 'string') {
      return html;
    }

    let processed = html;

    // 1. Remove markdown code blocks if present (common LLM artifact)
    processed = this.removeMarkdownWrapper(processed);

    // 2. Replace Logo Placeholder
    processed = this.replaceLogo(processed);

    // 3. Inject MathJax
    processed = this.ensureMathJaxScript(processed);

    return processed;
  }

  /**
   * Replaces LOGO_PLACEHOLDER with the actual base64 logo
   */
  private replaceLogo(html: string): string {
    if (html.includes('LOGO_PLACEHOLDER')) {
      let logoData = LOGO_BASE64;
      // Гарантируем наличие префикса, если его нет
      if (logoData && !logoData.startsWith('data:image')) {
        logoData = `data:image/png;base64,${logoData}`;
      }
      return html.replace(/LOGO_PLACEHOLDER/g, logoData);
    }
    return html;
  }

  /**
   * Removes ```html ... ``` wrapper if present
   */
  private removeMarkdownWrapper(html: string): string {
    let content = html;
    // Remove starting ```html or ```
    if (content.startsWith('```')) {
      content = content.replace(/^```(html)?\s*/i, '');
    }
    // Remove ending ```
    if (content.endsWith('```')) {
      content = content.replace(/\s*```$/, '');
    }
    return content;
  }

  /**
   * Ensures MathJax script is present in HTML if LaTeX formulas are detected
   */
  ensureMathJaxScript(html: string): string {
    if (!html || typeof html !== 'string') {
      return html;
    }

    // Check if HTML contains LaTeX formulas
    const hasFormulas = this.detectLatexFormulas(html);
    if (!hasFormulas) {
      return html;
    }

    // Check if MathJax script is already present
    const hasMathJaxScript = /mathjax/i.test(html);
    if (hasMathJaxScript) {
      return html;
    }

    // Inject MathJax script into <head>
    return this.injectMathJaxScript(html);
  }

  /**
   * Detects LaTeX formula syntax in HTML
   */
  private detectLatexFormulas(html: string): boolean {
    // Более надежный поиск LaTeX разметки:
    // 1. $$ ... $$ или $ ... $
    // 2. \( ... \) или \[ ... \] с учетом экранирования
    const latexRegex = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\(|\\\[|\\begin\{[a-z\*]+\}/i;
    return latexRegex.test(html);
  }

  /**
   * Injects MathJax script into HTML body section
   */
  private injectMathJaxScript(html: string): string {
    // Вставляем в конец body для максимальной совместимости
    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${this.MATHJAX_SCRIPT}\n</body>`);
    }

    // Если нет <body>, но есть <head>
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1>\n${this.MATHJAX_SCRIPT}`);
    }

    // Если нет ни head ни body, просто добавляем в конец
    return `${html}\n${this.MATHJAX_SCRIPT}`;
  }
}
