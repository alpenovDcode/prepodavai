export const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'

const MATHJAX_SCRIPT = `<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true
  },
  chtml: { fontCache: 'global' },
  startup: { typeset: true }
};
</script>
<script defer src="${MATHJAX_CDN}"></script>`

const WRAPPERS = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\(|\\\[|\\begin\{[a-z*]+\}/i
const COMMANDS = /\\(?:frac|sqrt|sum|int|prod|lim|cdot|times|pm|mp|leq|geq|neq|approx|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Theta|Lambda|Pi|Sigma|Phi|Omega|infty|text|mathbb|mathcal|mathrm|mathbf|mathit|xrightarrow|overrightarrow|vec|hat|bar|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|exp|angle|triangle|parallel|perp|in|notin|subset|cup|cap|forall|exists|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|to)\b/i

/**
 * Если HTML содержит LaTeX-формулы и в нём ещё нет <script src="...mathjax...">,
 * инжектит MathJax в <head> (не в </body>) — чтобы скрипт загружался как можно раньше.
 */
export function ensureMathJaxInHtml(html: string): string {
    if (!html || typeof html !== 'string') return html
    const hasFormulas = WRAPPERS.test(html) || COMMANDS.test(html)
    if (!hasFormulas) return html
    const hasMathJax = /<script[^>]+src=["'][^"']*mathjax[^"']*["']/i.test(html)
    if (hasMathJax) return html

    // Приоритет: вставляем в <head> — скрипт запускается раньше, формулы рендерятся без задержки
    if (/<head[\s>]/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, `<head$1>\n${MATHJAX_SCRIPT}`)
    }
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${MATHJAX_SCRIPT}\n</body>`)
    }
    return `${MATHJAX_SCRIPT}\n${html}`
}
