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

    // 2. Нормализуем footer/header (удаляем фейковые копирайты, гарантируем наличие логотипа)
    processed = this.normalizeBrandingBlocks(processed);

    // 3. Replace Logo Placeholder
    processed = this.replaceLogo(processed);

    // 4. Inject MathJax
    processed = this.ensureMathJaxScript(processed);

    return processed;
  }

  /**
   * Удаляет сгенерированные моделью фейковые копирайты и гарантирует,
   * что в документе есть <header> с логотипом и <footer> с логотипом.
   */
  private normalizeBrandingBlocks(html: string): string {
    let processed = html;
    const logoTag = '<img src="LOGO_PLACEHOLDER" alt="Logo">';
    const headerLogoTag = '<img src="LOGO_PLACEHOLDER" class="header-logo" alt="Logo">';

    // 1. Заменяем содержимое любого div.footer-logo на чистый логотип,
    //    независимо от того, что туда нагенерировала модель (копирайты, ссылки и т.д.)
    processed = processed.replace(
      /<div([^>]*\bclass="[^"]*\bfooter-logo\b[^"]*"[^>]*)>[\s\S]*?<\/div>/gi,
      `<div$1>${logoTag}</div>`,
    );

    // 2. Удаляем типовые паттерны фейковых копирайтов, если модель поставила их
    //    ВНЕ footer-logo (например в отдельном <div> в конце).
    processed = processed.replace(
      /<(div|p|footer)[^>]*>[\s\S]{0,400}?(?:&copy;|©)[\s\S]{0,400}?(?:Методический центр|Высший балл|Сгенерировано для подготовки)[\s\S]{0,400}?<\/\1>/gi,
      '',
    );

    // 3. Если в документе вообще нет footer-logo — добавляем его перед </body>
    if (!/class="[^"]*\bfooter-logo\b[^"]*"/i.test(processed) && /<\/body>/i.test(processed)) {
      processed = processed.replace(
        /<\/body>/i,
        `<div class="footer-logo">${logoTag}</div>\n</body>`,
      );
    }

    // 4. Если в header нет логотипа — вставляем его первым ребёнком <div class="header">
    processed = processed.replace(
      /<div([^>]*\bclass="[^"]*\bheader\b[^"]*"[^>]*)>([\s\S]*?)<\/div>/i,
      (match, attrs, inner) => {
        if (/LOGO_PLACEHOLDER|header-logo/i.test(inner)) return match;
        return `<div${attrs}>${headerLogoTag}${inner}</div>`;
      },
    );

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
    // Распознаём как обёртки, так и отдельные команды LaTeX.
    // 1. Обёртки: $$...$$, $...$, \(...\), \[...\], \begin{env}
    // 2. Команды без обёртки: \frac, \sqrt, \sum, \int, \cdot, \times, \alpha, \beta и т.д.
    // 3. Явный признак экзаменационных документов — наличие class="sheet"
    const wrappers = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\(|\\\[|\\begin\{[a-z\*]+\}/i;
    const commands = /\\(?:frac|sqrt|sum|int|prod|lim|cdot|times|pm|mp|leq|geq|neq|approx|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|infty|text|mathbb|mathcal|xrightarrow)\b/i;
    const examSheet = /class="[^"]*\bsheet\b[^"]*"/i;
    return wrappers.test(html) || commands.test(html) || examSheet.test(html);
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
