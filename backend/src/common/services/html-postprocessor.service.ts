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
            return html;
        }

        // Check if HTML contains LaTeX formulas
        const hasFormulas = this.detectLatexFormulas(html);
        if (!hasFormulas) {
            return html;
        }

        // Check if MathJax script is already present
        if (/mathjax/i.test(html)) {
            return html;
        }

        // Inject MathJax script into <head>
        return this.injectMathJaxScript(html);
    }

    /**
     * Detects LaTeX formula syntax in HTML
     */
    private detectLatexFormulas(html: string): boolean {
        // Check for common LaTeX delimiters
        return /\\\\\(|\\\\\[|\$\$|\$[^$]+\$/i.test(html);
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
