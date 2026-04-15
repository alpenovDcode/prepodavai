import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import katex from 'katex'
import 'katex/dist/katex.min.css'

function renderKatex(latex: string, displayMode: boolean): string {
    try {
        return katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            strict: 'ignore',
        })
    } catch {
        return `<code>${displayMode ? '$$' : '$'}${escapeHtml(latex)}${displayMode ? '$$' : '$'}</code>`
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildNodeView(displayMode: boolean) {
    return ({ node }: { node: { attrs: { latex: string } } }) => {
        const dom = document.createElement(displayMode ? 'div' : 'span')
        dom.setAttribute(displayMode ? 'data-math-block' : 'data-math', '')
        dom.setAttribute('data-latex', node.attrs.latex)
        dom.contentEditable = 'false'
        dom.innerHTML = renderKatex(node.attrs.latex, displayMode)
        dom.style.cursor = 'pointer'
        dom.title = (displayMode ? '$$' : '$') + node.attrs.latex + (displayMode ? '$$' : '$')
        return { dom }
    }
}

export const MathInline = Node.create({
    name: 'mathInline',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            latex: { default: '' },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-math]',
                getAttrs: (el) => {
                    const node = el as HTMLElement
                    const latex = node.getAttribute('data-latex') || node.textContent?.replace(/^\$|\$$/g, '') || ''
                    return { latex }
                },
            },
        ]
    },

    renderHTML({ node }) {
        const latex = node.attrs.latex || ''
        return [
            'span',
            mergeAttributes({ 'data-math': '', 'data-latex': latex }),
            `$${latex}$`,
        ]
    },

    addNodeView() {
        return buildNodeView(false) as any
    },

    addInputRules() {
        return [
            nodeInputRule({
                find: /(?:^|[\s(])\$([^$\n]+?)\$$/,
                type: this.type,
                getAttributes: (match) => ({ latex: match[1] }),
            }),
        ]
    },
})

export const MathBlock = Node.create({
    name: 'mathBlock',
    group: 'block',
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            latex: { default: '' },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-math-block]',
                getAttrs: (el) => {
                    const node = el as HTMLElement
                    const latex = node.getAttribute('data-latex') || node.textContent?.replace(/^\$\$|\$\$$/g, '') || ''
                    return { latex }
                },
            },
        ]
    },

    renderHTML({ node }) {
        const latex = node.attrs.latex || ''
        return [
            'div',
            mergeAttributes({ 'data-math-block': '', 'data-latex': latex }),
            `$$${latex}$$`,
        ]
    },

    addNodeView() {
        return buildNodeView(true) as any
    },

    addInputRules() {
        return [
            nodeInputRule({
                find: /\$\$([^$]+?)\$\$$/,
                type: this.type,
                getAttributes: (match) => ({ latex: match[1] }),
            }),
        ]
    },
})

/**
 * Заранее оборачивает $...$ / $$...$$ в теги, которые понимают MathInline/MathBlock,
 * чтобы при `setContent(html)` редактор сразу собирал их в math-ноды.
 * Избегаем кода внутри <pre>, <code>, атрибутов тегов.
 */
export function preprocessMathInHtml(html: string): string {
    if (!html) return html

    const placeholders: string[] = []
    const stash = (s: string) => {
        placeholders.push(s)
        return `\u0000M${placeholders.length - 1}\u0000`
    }

    let work = html
        .replace(/<(pre|code|script|style)[\s\S]*?<\/\1>/gi, (m) => stash(m))
        .replace(/<[^>]+>/g, (m) => stash(m))

    work = work.replace(/\$\$([^$]+?)\$\$/g, (_, expr) => {
        const esc = escapeAttr(expr)
        return `<div data-math-block data-latex="${esc}">$$${esc}$$</div>`
    })
    work = work.replace(/\$([^$\n]+?)\$/g, (_, expr) => {
        const esc = escapeAttr(expr)
        return `<span data-math data-latex="${esc}">$${esc}$</span>`
    })

    work = work.replace(/\u0000M(\d+)\u0000/g, (_, i) => placeholders[Number(i)])
    return work
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
