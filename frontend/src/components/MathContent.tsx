'use client'

import { useEffect, useRef } from 'react'
import DOMPurify from 'isomorphic-dompurify'

interface MathContentProps {
    html: string
    className?: string
    sanitize?: boolean
}

function ensureMathJaxLoaded(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    const w = window as any
    if (w.MathJax?.typesetPromise) return Promise.resolve()
    if (w.__mathJaxLoadingPromise) return w.__mathJaxLoadingPromise

    w.__mathJaxLoadingPromise = new Promise<void>((resolve) => {
        w.MathJax = {
            tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
                processEscapes: true,
            },
            svg: { fontCache: 'global' },
            startup: {
                ready: () => {
                    w.MathJax.startup.defaultReady()
                    w.MathJax.startup.promise.then(() => resolve())
                },
            },
        }
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
        script.async = true
        document.head.appendChild(script)
    })
    return w.__mathJaxLoadingPromise
}

export default function MathContent({ html, className, sanitize = true }: MathContentProps) {
    const ref = useRef<HTMLDivElement>(null)
    const safeHtml = sanitize ? DOMPurify.sanitize(html) : html

    useEffect(() => {
        if (!ref.current) return
        let cancelled = false
        ensureMathJaxLoaded().then(() => {
            const w = window as any
            if (cancelled || !ref.current || !w.MathJax?.typesetPromise) return
            w.MathJax.typesetClear?.([ref.current])
            w.MathJax.typesetPromise([ref.current]).catch(() => {})
        })
        return () => {
            cancelled = true
        }
    }, [safeHtml])

    return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />
}
