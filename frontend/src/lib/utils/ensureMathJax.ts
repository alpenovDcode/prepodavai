const MATHJAX_SCRIPT = `<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true
  },
  svg: { fontCache: 'global' }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`

const WRAPPERS = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\(|\\\[|\\begin\{[a-z*]+\}/i
const COMMANDS = /\\(?:frac|sqrt|sum|int|prod|lim|cdot|times|pm|mp|leq|geq|neq|approx|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Theta|Lambda|Pi|Sigma|Phi|Omega|infty|text|mathbb|mathcal|mathrm|mathbf|mathit|xrightarrow|overrightarrow|vec|hat|bar|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|exp|angle|triangle|parallel|perp|in|notin|subset|cup|cap|forall|exists|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|to)\b/i

/**
 * Если HTML содержит LaTeX-формулы и в нём ещё нет <script src="...mathjax...">,
 * инжектит MathJax. Нужно для iframe srcDoc, где старые (созданные до
 * серверного постпроцессора) генерации не содержат скрипт.
 */
export function ensureMathJaxInHtml(html: string): string {
    if (!html || typeof html !== 'string') return html
    const hasFormulas = WRAPPERS.test(html) || COMMANDS.test(html)
    if (!hasFormulas) return html
    const hasMathJax = /<script[^>]+src=["'][^"']*mathjax[^"']*["']/i.test(html)
    if (hasMathJax) return html

    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${MATHJAX_SCRIPT}\n</body>`)
    }
    if (/<head[\s>]/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, `<head$1>\n${MATHJAX_SCRIPT}`)
    }
    return `${html}\n${MATHJAX_SCRIPT}`
}
