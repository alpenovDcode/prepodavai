import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import { SlideDoc, pickSlideTheme } from '@/types/slide-doc';
import { SlideDocSlide } from './SlideDocRenderer';

interface SlideElement {
    id: string;
    type: 'text' | 'image' | 'video' | 'table' | 'shape';
    content: string;
    x: number;
    y: number;
    w: number;
    h: number;
    shapeType?: 'rect' | 'circle' | 'line' | 'arrow';
    tableData?: string[][];
    style?: {
        fontSize?: number;
        textAlign?: 'left' | 'center' | 'right';
        color?: string;
        bg?: string;
        fillColor?: string;
        strokeColor?: string;
        strokeWidth?: number;
    };
}

interface Slide {
    id: string;
    type: 'title' | 'content' | 'image';
    title?: string;
    subtitle?: string;
    content?: string[];
    imageDescription?: string;
    imageUrl?: string;
    theme?: 'light' | 'dark' | 'blue' | 'orange';
    elements?: SlideElement[];
}

interface PresentationPlayerProps {
    slides?: Slide[];
    slideDoc?: SlideDoc;
    initialSlideIndex?: number;
}

const THEMES = {
    light: { bg: 'bg-white', text: 'text-gray-900', accent: 'text-blue-600' },
    dark: { bg: 'bg-gray-900', text: 'text-white', accent: 'text-blue-400' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-900', accent: 'text-blue-700' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-900', accent: 'text-orange-700' }
};

// Helper to render math (Copied from PresentationEditor)
const renderMath = (text: string) => {
    if (!text) return '';
    let processed = text;

    const mathCommands = 'int|sum|frac|sqrt|lim|oint|prod|alpha|beta|gamma|theta|pi|infty|partial|nabla|pm|approx|neq|leq|geq';
    const autoWrapRegex = new RegExp(`(?<!\\\\\\(|\\\\\\$\\$|\\\\\\[)\\\\(?:${mathCommands})[^А-Яа-я<]*`, 'g');

    processed = processed.replace(autoWrapRegex, (match) => {
        if (match.trim().endsWith('\\)') || match.trim().endsWith('$$') || match.trim().endsWith('\\]')) {
            return match;
        }
        return `\\(${match}\\)`;
    });

    processed = processed.replace(/\\\((.+?)\\\)/gs, (_, formula) => {
        return `<span class="math-inline">\\(${formula}\\)</span>`;
    });
    processed = processed.replace(/\$\$(.+?)\$\$/gs, (_, formula) => {
        return `<div class="math-block">\\[${formula}\\]</div>`;
    });
    processed = processed.replace(/\\\[(.+?)\\\]/gs, (_, formula) => {
        return `<div class="math-block">\\[${formula}\\]</div>`;
    });

    return processed;
};

// Read-only Element Wrapper
const ReadOnlyElement = ({ element, children }: { element: SlideElement, children: React.ReactNode }) => {
    return (
        <div
            className="absolute z-0"
            style={{
                left: `${element.x}%`,
                top: `${element.y}%`,
                width: `${element.w}%`,
                height: `${element.h}%`,
            }}
        >
            <div className="w-full h-full overflow-hidden">
                {children}
            </div>
        </div>
    );
};

// Read-only Text Renderer
const ReadOnlyText = ({ content }: { content: string }) => {
    const viewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (viewRef.current && (window as any).MathJax?.typesetPromise) {
            setTimeout(() => {
                (window as any).MathJax.typesetPromise([viewRef.current]).catch((err: any) => console.error('MathJax error:', err));
            }, 0);
        }
    }, [content]);

    return (
        <div
            ref={viewRef}
            className="w-full h-full p-2 cursor-default"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMath(content)) }}
            style={{ minHeight: '100%' }}
        />
    );
};

export default function PresentationPlayer({ slides: initialSlides, slideDoc, initialSlideIndex = 0 }: PresentationPlayerProps) {
    const [slides, setSlides] = useState<Slide[]>([]);
    const [currentIndex, setCurrentIndex] = useState(initialSlideIndex);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const isSlideDocMode = !!slideDoc && slideDoc.slides?.length > 0;
    const totalSlides = isSlideDocMode ? slideDoc!.slides.length : slides.length;
    const slideDocTheme = isSlideDocMode ? pickSlideTheme(slideDoc!.themeId) : null;

    // Initialize and Migrate Data
    useEffect(() => {
        if (isSlideDocMode) return; // SlideDoc path doesn't need migration.
        if (initialSlides && initialSlides.length > 0) {
            const migrated = initialSlides.map(slide => {
                if (slide.elements) return slide;

                // Migration Logic
                const elements: SlideElement[] = [];

                // Title
                if (slide.title) {
                    elements.push({
                        id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-title`,
                        type: 'text',
                        content: `<div style="font-size: 36px; font-weight: bold; text-align: center;">${slide.title}</div>`,
                        x: 10, y: 5, w: 80, h: 15
                    });
                }

                // Subtitle
                if (slide.subtitle) {
                    elements.push({
                        id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-sub`,
                        type: 'text',
                        content: `<div style="font-size: 24px; text-align: center; color: gray;">${slide.subtitle}</div>`,
                        x: 15, y: 25, w: 70, h: 10
                    });
                }

                // Content (Bullets)
                if (slide.content && slide.content.length > 0) {
                    const htmlContent = `<ul style="font-size: 18px;">${slide.content.map(c => `<li>${c}</li>`).join('')}</ul>`;
                    elements.push({
                        id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-content`,
                        type: 'text',
                        content: htmlContent,
                        x: 10, y: 40, w: slide.imageUrl ? 45 : 80, h: 50
                    });
                }

                // Image
                if (slide.imageUrl) {
                    elements.push({
                        id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-img`,
                        type: 'image',
                        content: slide.imageUrl,
                        x: 60, y: 40, w: 30, h: 40
                    });
                }

                return { ...slide, elements };
            });
            setSlides(migrated);
        }
    }, [initialSlides]);

    // Load MathJax (Ensure it's loaded if not already)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if ((window as any).MathJaxLoader) return;
        (window as any).MathJaxLoader = true;

        (window as any).MathJax = {
            tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
                processEscapes: true
            },
            svg: { fontCache: 'global' }
        };

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
        script.async = true;
        document.head.appendChild(script);
    }, []);

    const nextSlide = () => {
        if (currentIndex < totalSlides - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const prevSlide = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'Space') {
                nextSlide();
            } else if (e.key === 'ArrowLeft') {
                prevSlide();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, totalSlides]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);


    if (totalSlides === 0) {
        return <div className="flex justify-center items-center h-full text-gray-500">No slides available.</div>;
    }

    if (isSlideDocMode && slideDoc && slideDocTheme) {
        const slide = slideDoc.slides[currentIndex];
        return (
            <div ref={containerRef} className={`flex flex-col h-full bg-gray-900 ${isFullscreen ? 'p-0' : 'p-4'}`}>
                <div className="flex-1 flex justify-center items-center relative overflow-hidden">
                    <div className="w-full max-w-5xl aspect-video shadow-2xl rounded-lg overflow-hidden bg-white">
                        <SlideDocSlide slide={slide} theme={slideDocTheme} />
                    </div>
                </div>
                <div className="h-16 flex items-center justify-between px-8 text-white bg-gray-900/80 backdrop-blur-sm absolute bottom-0 left-0 right-0 opacity-0 hover:opacity-100 transition-opacity duration-300">
                    <span className="font-mono text-sm">{currentIndex + 1} / {totalSlides}</span>
                    <div className="flex items-center gap-6">
                        <button onClick={prevSlide} disabled={currentIndex === 0} className={`p-2 rounded-full hover:bg-white/10 transition ${currentIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}><ChevronLeft size={24} /></button>
                        <button onClick={nextSlide} disabled={currentIndex === totalSlides - 1} className={`p-2 rounded-full hover:bg-white/10 transition ${currentIndex === totalSlides - 1 ? 'opacity-50 cursor-not-allowed' : ''}`}><ChevronRight size={24} /></button>
                    </div>
                    <button onClick={toggleFullscreen} className="p-2 rounded-full hover:bg-white/10 transition">
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                </div>
            </div>
        );
    }

    const currentSlide = slides[currentIndex];
    // Use global theme from the slide if available, or default to light? 
    // The editor has a global theme state. Here we might need to infer it or just use the slide's theme if we stored it per slide (which we don't seem to fully do in the editor state, but let's check).
    // The editor uses `globalTheme` state. The `Slide` interface has a `theme` property. Let's use that if present, otherwise default to light.
    const themeKey = currentSlide.theme || 'light';
    const currentTheme = THEMES[themeKey];

    return (
        <div ref={containerRef} className={`flex flex-col h-full bg-gray-900 ${isFullscreen ? 'p-0' : 'p-4'}`}>
            {/* Slide Display */}
            <div className="flex-1 flex justify-center items-center relative overflow-hidden">
                <div
                    className={`w-full max-w-5xl aspect-video shadow-2xl rounded-lg relative transition-colors overflow-hidden ${currentTheme.bg} ${currentTheme.text}`}
                >
                    {currentSlide.elements?.map(el => (
                        <ReadOnlyElement key={el.id} element={el}>
                            {el.type === 'text' && (
                                <ReadOnlyText content={el.content} />
                            )}
                            {el.type === 'image' && (
                                <img src={el.content} alt="" className="w-full h-full object-cover pointer-events-none" />
                            )}
                            {el.type === 'video' && (
                                <video
                                    src={el.content}
                                    className="w-full h-full object-cover"
                                    controls
                                />
                            )}
                            {el.type === 'table' && el.tableData && (
                                <table className="w-full h-full border-collapse border border-gray-400 bg-white text-black text-sm">
                                    <tbody>
                                        {el.tableData.map((row, rIndex) => (
                                            <tr key={rIndex}>
                                                {row.map((cell, cIndex) => (
                                                    <td key={cIndex} className="border border-gray-300 p-1 min-w-[20px]">
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {el.type === 'shape' && (
                                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                                    {el.shapeType === 'rect' && (
                                        <rect x="0" y="0" width="100" height="100" fill={el.style?.fillColor || '#3B82F6'} stroke={el.style?.strokeColor || '#2563EB'} strokeWidth={el.style?.strokeWidth || 2} />
                                    )}
                                    {el.shapeType === 'circle' && (
                                        <ellipse cx="50" cy="50" rx="49" ry="49" fill={el.style?.fillColor || '#3B82F6'} stroke={el.style?.strokeColor || '#2563EB'} strokeWidth={el.style?.strokeWidth || 2} />
                                    )}
                                    {el.shapeType === 'line' && (
                                        <line x1="0" y1="50" x2="100" y2="50" stroke={el.style?.strokeColor || '#2563EB'} strokeWidth={el.style?.strokeWidth || 2} />
                                    )}
                                    {el.shapeType === 'arrow' && (
                                        <g>
                                            <line x1="0" y1="50" x2="95" y2="50" stroke={el.style?.strokeColor || '#2563EB'} strokeWidth={el.style?.strokeWidth || 2} />
                                            <polygon points="95,45 100,50 95,55" fill={el.style?.strokeColor || '#2563EB'} />
                                        </g>
                                    )}
                                </svg>
                            )}
                        </ReadOnlyElement>
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div className="h-16 flex items-center justify-between px-8 text-white bg-gray-900/80 backdrop-blur-sm absolute bottom-0 left-0 right-0 opacity-0 hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center gap-4">
                    <span className="font-mono text-sm">
                        {currentIndex + 1} / {slides.length}
                    </span>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={prevSlide}
                        disabled={currentIndex === 0}
                        className={`p-2 rounded-full hover:bg-white/10 transition ${currentIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <button
                        onClick={nextSlide}
                        disabled={currentIndex === slides.length - 1}
                        className={`p-2 rounded-full hover:bg-white/10 transition ${currentIndex === slides.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={toggleFullscreen} className="p-2 rounded-full hover:bg-white/10 transition">
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
