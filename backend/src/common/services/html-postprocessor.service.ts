import { Injectable } from '@nestjs/common';

@Injectable()
export class HtmlPostprocessorService {
    private readonly MATHJAX_SCRIPT = `<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true
  },
  svg: {
    fontCache: 'global'
  }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

    /**
     * Ensures MathJax script is present in HTML if LaTeX formulas are detected
     */
    ensureMathJaxScript(html: string): string {
        if (!html || typeof html !== 'string') {
            console.log('[HtmlPostprocessor] Input is empty or not a string, skipping');
            return html;
        }

        // Check if HTML contains LaTeX formulas
        const hasFormulas = this.detectLatexFormulas(html);
        console.log(`[HtmlPostprocessor] LaTeX formulas detected: ${hasFormulas}`);
        if (!hasFormulas) {
            return html;
        }

        // Check if MathJax script is already present
        const hasMathJaxScript = /mathjax/i.test(html);
        console.log(`[HtmlPostprocessor] MathJax script already present: ${hasMathJaxScript}`);
        if (hasMathJaxScript) {
            return html;
        }

        // Inject MathJax script into <head>
        console.log('[HtmlPostprocessor] Injecting MathJax script into HTML');
        const result = this.injectMathJaxScript(html);
        console.log(`[HtmlPostprocessor] MathJax injection complete, result length: ${result.length}`);
        return result;
    }

    /**
   * Detects LaTeX formula syntax in HTML
   */
    private detectLatexFormulas(html: string): boolean {
        // Check for common LaTeX delimiters with content
        // Matches: $$ ... $$, $ ... $, \( ... \), \[ ... \]
        return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\\?\([\s\S]+?\\\\?\)|\\\\?\[[\s\S]+?\\\\?\]/i.test(html);
    }

    /**
     * Injects MathJax script into HTML <head> section
     */
    private injectMathJaxScript(html: string): string {
        // Try to inject into existing <head>
        if (/<head[\s>]/i.test(html)) {
            return html.replace(/<head([^>]*)>/i, `<head$1>\n${this.MATHJAX_SCRIPT}`);
        }

        // If no <head>, try to inject before <body>
        if (/<body[\s>]/i.test(html)) {
            return html.replace(/<body/i, `<head>\n${this.MATHJAX_SCRIPT}\n</head>\n<body`);
        }

        // If no <head> or <body>, wrap entire content
        return `<!DOCTYPE html>
<html>
<head>
${this.MATHJAX_SCRIPT}
</head>
<body>
${html}
</body>
</html>`;
    }
}
