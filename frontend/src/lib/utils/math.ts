export const renderMath = (text: string) => {
    if (!text) return '';
    let processed = text;

    // Heuristic: Auto-wrap unwrapped LaTeX
    // Look for patterns starting with a known math command and continuing with non-Cyrillic characters
    // We exclude existing wrapped blocks from this check by doing this BEFORE processing delimiters? 
    // No, we should do it carefully.

    // Regex explanation:
    // (?<!\\\(|\\\$\$|\\\[) : Negative lookbehind to ensure not already starting with delimiter (simplified)
    // \\(int|sum|frac|sqrt|lim|oint|prod|alpha|beta|gamma|theta|pi|infty|partial|nabla|pm|approx|neq|leq|geq) : Start with command
    // [^А-Яа-я<]* : Match anything that is NOT Cyrillic and NOT start of HTML tag
    // (?=[А-Яа-я<]|$) : Lookahead for Cyrillic, HTML tag, or end of string

    const mathCommands = 'int|sum|frac|sqrt|lim|oint|prod|alpha|beta|gamma|theta|pi|infty|partial|nabla|pm|approx|neq|leq|geq';
    const autoWrapRegex = new RegExp(`(?<!\\\\\\(|\\\\\\$\\$|\\\\\\[)\\\\(?:${mathCommands})[^А-Яа-я<]*`, 'g');

    processed = processed.replace(autoWrapRegex, (match) => {
        // Double check it's not already wrapped at the end
        if (match.trim().endsWith('\\)') || match.trim().endsWith('$$') || match.trim().endsWith('\\]')) {
            return match;
        }
        return `\\(${match}\\)`;
    });

    // Wrap math in spans/divs for MathJax
    // Inline math: \( ... \)
    processed = processed.replace(/\\\((.+?)\\\)/gs, (_, formula) => {
        return `<span class="math-inline">\\(${formula}\\)</span>`;
    });
    // Display math: $$ ... $$
    processed = processed.replace(/\$\$(.+?)\$\$/gs, (_, formula) => {
        return `<div class="math-block">\\[${formula}\\]</div>`;
    });
    // Display math: \[ ... \]
    processed = processed.replace(/\\\[(.+?)\\\]/gs, (_, formula) => {
        return `<div class="math-block">\\[${formula}\\]</div>`;
    });

    return processed;
};
