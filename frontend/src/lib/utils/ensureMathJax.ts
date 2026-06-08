export const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'

/**
 * Strips MathJax scripts from HTML so the browser doesn't auto-render LaTeX
 * in edit mode. Without this, MathJax converts \(...\) to <mjx-container>
 * CHTML elements, and saving those CHTML elements instead of the original
 * LaTeX source breaks subsequent renders (PDF, preview).
 */
export function stripMathJaxScripts(html: string): string {
    if (!html || typeof html !== 'string') return html
    // Remove the MathJax config inline script.
    // Use \s* (not [\s\S]*?) before window.MathJax so the regex can't skip
    // across a preceding </script> boundary and accidentally eat other scripts.
    let result = html.replace(/<script[^>]*>\s*window\.MathJax[\s\S]*?<\/script>/gi, '')
    // Remove the MathJax CDN loader script
    result = result.replace(/<script[^>]+src=["'][^"']*mathjax[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
    // Полифилл polyfill.io мёртв и блокирует загрузку iframe.
    result = result.replace(
        /<script[^>]+src=["'][^"']*polyfill\.io[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
        '',
    )
    return result
}

const MATHJAX_SCRIPT = `<script>
window.MathJax = {
  loader: { load: ['[tex]/mhchem'] },
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true,
    packages: {'[+]': ['mhchem']}
  },
  options: { enableMenu: false },
  startup: { typeset: true }
};
</script>
<script async src="${MATHJAX_CDN}"></script>`

const WRAPPERS = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\(|\\\[|\\begin\{[a-z*]+\}/i
const COMMANDS = /\\(?:frac|sqrt|sum|int|prod|lim|cdot|times|pm|mp|leq|geq|neq|approx|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Theta|Lambda|Pi|Sigma|Phi|Omega|infty|text|mathbb|mathcal|mathrm|mathbf|mathit|xrightarrow|overrightarrow|vec|hat|bar|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|exp|angle|triangle|parallel|perp|in|notin|subset|cup|cap|forall|exists|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|to|ce|color|style|tag|label|ref|cite)\b/i

/**
 * Если HTML содержит LaTeX-формулы и в нём ещё нет <script src="...mathjax...">,
 * инжектит MathJax в <head> (не в </body>) — чтобы скрипт загружался как можно раньше.
 */
/**
 * Удаляем ссылки на мёртвый polyfill.io — он завершился, и попытка его
 * загрузить блокирует iframe (ERR_CONNECTION_CLOSED) и тормозит появление
 * результата. Если он попал в HTML от старой генерации — выпиливаем.
 */
function stripDeadPolyfills(html: string): string {
    return html.replace(
        /<script[^>]+src=["'][^"']*polyfill\.io[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
        '',
    )
}

export function ensureMathJaxInHtml(html: string): string {
    if (!html || typeof html !== 'string') return html
    html = stripDeadPolyfills(html)
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
