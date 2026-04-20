const MATHJAX_SCRIPT = `<script>
window.MathJax = {
  loader: { load: ['[tex]/mhchem'] },
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true,
    packages: {'[+]': ['mhchem']}
  },
  options: {
    enableMenu: false
  },
  startup: {
    typeset: true
  }
};
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

function detectLatexFormulas(html) {
    const wrappers = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\(|\\\[|\\begin\{[a-z\*]+\}/i;
    const commands = /\\(?:frac|sqrt|sum|int|prod|lim|cdot|times|pm|mp|leq|geq|neq|approx|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Theta|Lambda|Pi|Sigma|Phi|Omega|infty|text|mathbb|mathcal|mathrm|mathbf|mathit|xrightarrow|overrightarrow|vec|hat|bar|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|exp|angle|triangle|parallel|perp|in|notin|subset|cup|cap|forall|exists|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|to|ce|color|style|tag|label|ref|cite)\b/i;
    const examSheet = /class="[^"]*\bsheet\b[^"]*"/i;
    return wrappers.test(html) || commands.test(html) || examSheet.test(html);
}

const testCases = [
    { name: "Inline Math with $", html: "Hello $x^2$", expected: true },
    { name: "Inline Math with \\(", html: "Hello \\(x^2\\)", expected: true },
    { name: "Display Math with $$", html: "$$E=mc^2$$", expected: true },
    { name: "Display Math with \\[", html: "\\[E=mc^2\\]", expected: true },
    { name: "Chemistry with \\ce", html: "Water is \\ce{H2O}", expected: true },
    { name: "LaTeX Color", html: "Color is \\color{red}{text}", expected: true },
    { name: "Exam Sheet", html: '<div class="sheet">Exam Content</div>', expected: true },
    { name: "Plain Text", html: "Hello world", expected: false }
];

console.log("--- Testing Formula Detection ---");
testCases.forEach(tc => {
    const result = detectLatexFormulas(tc.html);
    console.log(`[${result === tc.expected ? "PASS" : "FAIL"}] ${tc.name}: ${result}`);
});

console.log("\n--- Testing Script Content ---");
console.log("Is mhchem loaded?", MATHJAX_SCRIPT.includes("mhchem"));
console.log("Is inlineMath configured with $ and \\\\(?", MATHJAX_SCRIPT.includes("['$', '$']") && MATHJAX_SCRIPT.includes("['\\\\\\\\(', '\\\\\\\\)']"));
