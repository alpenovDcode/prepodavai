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

    // 1. Перестраиваем блок <div class="header">...</div> целиком:
    //    выбрасываем всё, что модель туда нагенерировала (фейковые бренды, свои лого и т.д.),
    //    оставляем только логотип слева и <h1> справа.
    processed = this.rebuildMatchedDiv(processed, 'header', (inner) => {
      const h1Match = inner.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = h1Match ? h1Match[1].trim() : '';
      return `${headerLogoTag}<h1>${title}</h1>`;
    });

    // 2. Перестраиваем блок <div class="footer-logo">...</div> — оставляем только логотип.
    processed = this.rebuildMatchedDiv(processed, 'footer-logo', () => logoTag);

    // 3. Удаляем типовые фейковые копирайты, если модель поставила их в отдельном
    //    <div>/<p>/<footer> ВНЕ footer-logo.
    processed = processed.replace(
      /<(div|p|footer)[^>]*>[\s\S]{0,400}?(?:&copy;|©)[\s\S]{0,400}?(?:Методический центр|Высший балл|Сгенерировано для подготовки|BIOMETHODICA)[\s\S]{0,400}?<\/\1>/gi,
      '',
    );

    // 4. Если в документе нет footer-logo — добавляем его перед </body>.
    if (!/class="[^"]*\bfooter-logo\b[^"]*"/i.test(processed) && /<\/body>/i.test(processed)) {
      processed = processed.replace(
        /<\/body>/i,
        `<div class="footer-logo">${logoTag}</div>\n</body>`,
      );
    }

    // 5. Если нет <div class="header"> — добавляем его сразу после открывающего <body>
    //    (случай, когда модель вообще опустила шапку).
    if (!/class="[^"]*\bheader\b(?!-logo)[^"]*"/i.test(processed) && /<body[^>]*>/i.test(processed)) {
      processed = processed.replace(
        /<body([^>]*)>/i,
        `<body$1>\n<div class="header">${headerLogoTag}<h1></h1></div>`,
      );
    }

    return processed;
  }

  /**
   * Находит <div class="...CLASSNAME..."> с корректным учётом вложенных div-ов
   * и заменяет содержимое на результат builder(innerHtml). Открывающий тег сохраняется.
   */
  private rebuildMatchedDiv(
    html: string,
    className: string,
    builder: (inner: string) => string,
  ): string {
    // Для header нужен именно class="header", но НЕ "header-logo"
    const classRegex =
      className === 'header'
        ? new RegExp(`<div\\b[^>]*\\bclass="[^"]*\\bheader\\b(?!-logo)[^"]*"[^>]*>`, 'i')
        : new RegExp(`<div\\b[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'i');

    let result = '';
    let rest = html;
    while (true) {
      const match = rest.match(classRegex);
      if (!match || match.index === undefined) {
        result += rest;
        break;
      }

      const openEnd = match.index + match[0].length;
      // Ищем парный </div> с учётом вложенности
      let depth = 1;
      let i = openEnd;
      const divTagRegex = /<div\b[^>]*>|<\/div>/gi;
      divTagRegex.lastIndex = openEnd;
      let closeEnd = -1;
      let tag: RegExpExecArray | null;
      while ((tag = divTagRegex.exec(rest)) !== null) {
        if (tag[0].toLowerCase().startsWith('</div')) {
          depth--;
          if (depth === 0) {
            i = tag.index;
            closeEnd = tag.index + tag[0].length;
            break;
          }
        } else {
          depth++;
        }
      }
      if (closeEnd === -1) {
        // Парный </div> не найден — оставляем как есть
        result += rest;
        break;
      }

      const inner = rest.slice(openEnd, i);
      const rebuilt = `${match[0]}${builder(inner)}</div>`;
      result += rest.slice(0, match.index) + rebuilt;
      rest = rest.slice(closeEnd);
    }
    return result;
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
