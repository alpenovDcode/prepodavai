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
            return html.replace(/LOGO_PLACEHOLDER/g, LOGO_BASE64);
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
