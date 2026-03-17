import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useLayoutEffect } from 'react';
import pptxgen from 'pptxgenjs';
import { Save, Plus, Trash2, Download, Layout, Type, Image as ImageIcon, Loader2, Bold, Italic, Palette, Move, Maximize, MousePointer2, Upload, Table as TableIcon, Square, Circle, Minus, ArrowRight, Pi } from 'lucide-react';
import { LOGO_BASE64 } from '@/constants/branding';
import { apiClient } from '@/lib/api/client';
import DOMPurify from 'isomorphic-dompurify';

const FORMULA_PRESETS = [
    { name: 'Квадратное уравнение', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    { name: 'Бином Ньютона', latex: '(x+a)^n = \\sum_{k=0}^n \\binom{n}{k} x^k a^{n-k}' },
    { name: 'Площадь круга', latex: 'A = \\pi r^2' },
    { name: 'Теорема Пифагора', latex: 'a^2 + b^2 = c^2' },
    { name: 'Ряд Фурье', latex: 'f(x) = a_0 + \\sum_{n=1}^{\\infty} (a_n \\cos\\frac{n\\pi x}{L} + b_n \\sin\\frac{n\\pi x}{L})' },
    { name: 'Ряд Тейлора', latex: 'e^x = \\sum_{n=0}^\\infty \\frac{x^n}{n!} = 1 + x + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\cdots' },
];

// --- Types ---

import { Slide, SlideElement } from '@/types/presentation';

interface PresentationEditorProps {
    initialData: Slide[];
    onSave?: (slides: Slide[]) => void;
}

export interface PresentationEditorRef {
    save: () => void;
    export: () => void;
}

const THEMES = {
    light: { bg: 'bg-white', text: 'text-gray-900', accent: 'text-blue-600' },
    dark: { bg: 'bg-gray-900', text: 'text-white', accent: 'text-blue-400' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-900', accent: 'text-blue-700' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-900', accent: 'text-orange-700' }
};

// --- Components ---

const DraggableResizable = ({ element, isSelected, onSelect, onUpdate, children, containerRef }: any) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const startPos = useRef({ x: 0, y: 0, elX: 0, elY: 0, elW: 0, elH: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click

        // For complex elements (video, table), only allow drag via handle when selected
        // This allows interacting with the content (controls, inputs) without initiating a drag
        if (isSelected && ['video', 'table'].includes(element.type)) {
            const target = e.target as HTMLElement;
            if (!target.closest('.drag-handle')) {
                e.stopPropagation();
                return;
            }
        }

        e.stopPropagation();
        onSelect();

        const container = containerRef.current;
        if (!container) return;

        setIsDragging(true);
        startPos.current = {
            x: e.clientX,
            y: e.clientY,
            elX: element.x,
            elY: element.y,
            elW: element.w,
            elH: element.h
        };
    };

    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;

        setIsResizing(true);
        startPos.current = {
            x: e.clientX,
            y: e.clientY,
            elX: element.x,
            elY: element.y,
            elW: element.w,
            elH: element.h
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging && !isResizing) return;

            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();

            if (isDragging) {
                const dx = (e.clientX - startPos.current.x) / rect.width * 100;
                const dy = (e.clientY - startPos.current.y) / rect.height * 100;
                onUpdate(element.id, {
                    x: Math.max(0, Math.min(100 - element.w, startPos.current.elX + dx)),
                    y: Math.max(0, Math.min(100 - element.h, startPos.current.elY + dy))
                });
            } else if (isResizing) {
                const dx = (e.clientX - startPos.current.x) / rect.width * 100;
                const dy = (e.clientY - startPos.current.y) / rect.height * 100;
                onUpdate(element.id, {
                    w: Math.max(2, startPos.current.elW + dx),
                    h: Math.max(2, startPos.current.elH + dy)
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, element.id, onUpdate]);

    return (
        <div
            className={`absolute group ${isSelected ? 'z-10 ring-2 ring-blue-500' : 'z-0 hover:ring-1 hover:ring-blue-300'}`}
            style={{
                left: `${element.x}%`,
                top: `${element.y}%`,
                width: `${element.w}%`,
                height: `${element.h}%`,
            }}
            onMouseDown={handleMouseDown}
        >
            {/* Drag Handle (Move Icon) */}
            {isSelected && (
                <div className="drag-handle absolute -top-6 left-0 bg-blue-500 text-white p-1 rounded-t cursor-move flex items-center gap-1 text-xs">
                    <Move size={12} />
                    <span>Drag</span>
                </div>
            )}

            {/* Content */}
            <div className="w-full h-full overflow-hidden">
                {children}
            </div>

            {/* Resize Handle */}
            {isSelected && (
                <div
                    className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize flex items-center justify-center text-white"
                    onMouseDown={handleResizeMouseDown}
                >
                    <Maximize size={10} className="transform rotate-90" />
                </div>
            )}
        </div>
    );
};

import { renderMath } from '@/lib/utils/math';

const RichTextEditor = ({ content, onChange, isSelected, onBlur }: any) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLDivElement>(null);

    // Edit Mode: Sync content
    useLayoutEffect(() => {
        if (isSelected && editorRef.current && editorRef.current.innerHTML !== content) {
            if (document.activeElement !== editorRef.current) {
                editorRef.current.innerHTML = content;
            }
        }
    }, [content, isSelected]);

    // View Mode: Render MathJax
    useLayoutEffect(() => {
        if (!isSelected && viewRef.current && (window as any).MathJax?.typesetPromise) {
            const el = viewRef.current;
            // Always update content, MathJax will process it
            el.innerHTML = renderMath(content);
            (window as any).MathJax.typesetPromise([el]).catch((err: any) => console.error('MathJax error:', err));
        }
    }, [content, isSelected]);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    if (isSelected) {
        return (
            <div
                ref={editorRef}
                contentEditable
                className="w-full h-full outline-none p-2 cursor-text"
                onInput={handleInput}
                onMouseDown={(e) => e.stopPropagation()}
                onBlur={() => {
                    handleInput();
                    if (onBlur) onBlur();
                }}
                suppressContentEditableWarning
                style={{ minHeight: '100%' }}
            />
        );
    } else {
        return (
            <div
                ref={viewRef}
                className="w-full h-full p-2 cursor-default"
                style={{ minHeight: '100%' }}
            />
        );
    }
};

// Formula Insert Modal
const FormulaInsertModal = ({ isOpen, onClose, onInsert }: { isOpen: boolean; onClose: () => void; onInsert: (latex: string) => void }) => {
    const [customFormula, setCustomFormula] = useState('');
    const previewRef = useRef<HTMLDivElement>(null);
    const presetsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && previewRef.current && (window as any).MathJax?.typesetPromise) {
            // Update preview when custom formula changes
            const previewEl = previewRef.current;
            previewEl.innerHTML = `\\[${customFormula}\\]`;
            (window as any).MathJax.typesetPromise([previewEl]).catch((err: any) => console.error(err));
        }
    }, [customFormula, isOpen]);

    useEffect(() => {
        if (isOpen && presetsContainerRef.current && (window as any).MathJax?.typesetPromise) {
            // Typeset presets when modal opens
            (window as any).MathJax.typesetPromise([presetsContainerRef.current]).catch((err: any) => console.error(err));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col text-gray-900">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="font-semibold text-lg text-gray-900">Вставка формулы</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <Plus className="transform rotate-45" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Custom Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-900">Своя формула (LaTeX)</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={customFormula}
                                onChange={(e) => setCustomFormula(e.target.value)}
                                placeholder="Например: E = mc^2"
                                className="flex-1 border rounded-md p-2 font-mono text-sm text-gray-900 placeholder-gray-400"
                            />
                            <button
                                onClick={() => onInsert(customFormula)}
                                disabled={!customFormula}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                Вставить
                            </button>
                        </div>
                        {/* Preview */}
                        <div className="min-h-[60px] p-4 bg-gray-50 rounded border flex items-center justify-center text-black">
                            <div ref={previewRef} className="text-lg text-black"></div>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Встроенные формулы</h4>
                        <div ref={presetsContainerRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {FORMULA_PRESETS.map((preset, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onInsert(preset.latex)}
                                    className="flex flex-col items-center p-4 border rounded hover:bg-blue-50 hover:border-blue-300 transition-colors text-center group max-w-full"
                                >
                                    <span className="text-xs text-gray-500 mb-2 group-hover:text-blue-600">{preset.name}</span>
                                    <div className="text-black w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMath(`\\[${preset.latex}\\]`)) }} />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

import PDFExporter from './PDFExporter';

// --- Main Component ---

const PresentationEditor = forwardRef<PresentationEditorRef, PresentationEditorProps>(({ initialData, onSave }, ref) => {
    const [slides, setSlides] = useState<Slide[]>(initialData);
    const [activeSlideIndex, setActiveSlideIndex] = useState(0);
    const [generatingImage, setGeneratingImage] = useState<string | null>(null);
    const [globalTheme, setGlobalTheme] = useState<'light' | 'dark' | 'blue' | 'orange'>('light');
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [editingElementId, setEditingElementId] = useState<string | null>(null);
    const [showFormulaModal, setShowFormulaModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
        save: () => {
            if (onSave) onSave(slides);
        },
        export: () => {
            setIsExporting(true);
        }
    }));

    // Toolbar state
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);

    // Load MathJax
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

    // Initialize and Migrate Data
    useEffect(() => {
        if (initialData && initialData.length > 0) {
            const migrated = initialData.map(slide => {
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
    }, [initialData]);

    const activeSlide = slides[activeSlideIndex];
    const currentTheme = THEMES[globalTheme];

    // --- Actions ---

    const updateSlideElements = (slideId: string, newElements: SlideElement[]) => {
        setSlides(slides.map(s => s.id === slideId ? { ...s, elements: newElements } : s));
    };

    const updateElement = (elId: string, updates: Partial<SlideElement>) => {
        if (!activeSlide || !activeSlide.elements) return;
        const newElements = activeSlide.elements.map(el => el.id === elId ? { ...el, ...updates } : el);
        updateSlideElements(activeSlide.id, newElements);
    };

    const addTextElement = () => {
        if (!activeSlide) return;
        const newEl: SlideElement = {
            id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'text',
            content: '<div>New Text</div>',
            x: 30, y: 30, w: 40, h: 20
        };
        updateSlideElements(activeSlide.id, [...(activeSlide.elements || []), newEl]);
        setSelectedElementId(newEl.id);
    };

    const addTableElement = () => {
        if (!activeSlide) return;
        const newEl: SlideElement = {
            id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'table',
            content: '',
            tableData: [['Header 1', 'Header 2'], ['Cell 1', 'Cell 2']],
            x: 30, y: 30, w: 40, h: 30
        };
        updateSlideElements(activeSlide.id, [...(activeSlide.elements || []), newEl]);
        setSelectedElementId(newEl.id);
    };

    const addShapeElement = (shapeType: 'rect' | 'circle' | 'line' | 'arrow') => {
        if (!activeSlide) return;
        const newEl: SlideElement = {
            id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'shape',
            shapeType,
            content: '',
            x: 30, y: 30, w: 20, h: 20,
            style: { fillColor: '#3B82F6', strokeColor: '#2563EB', strokeWidth: 2 }
        };
        updateSlideElements(activeSlide.id, [...(activeSlide.elements || []), newEl]);
        setSelectedElementId(newEl.id);
    };

    const handleInsertFormula = (latex: string) => {
        if (!activeSlide) return;
        const newEl: SlideElement = {
            id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'text',
            content: `<div class="math-block">\\[${latex}\\]</div>`,
            x: 30, y: 30, w: 40, h: 20,
            style: { textAlign: 'center', fontSize: 24 }
        };
        updateSlideElements(activeSlide.id, [...(activeSlide.elements || []), newEl]);
        setSelectedElementId(newEl.id);
        setShowFormulaModal(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeSlide) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            let result = ev.target?.result as string;

            // Hack: Chrome doesn't support video/quicktime (MOV) well, but often plays it if we claim it's MP4
            if (result.startsWith('data:video/quicktime')) {
                result = result.replace('data:video/quicktime', 'data:video/mp4');
            }

            const type = file.type.startsWith('video') ? 'video' : 'image';

            const newEl: SlideElement = {
                id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type,
                content: result,
                x: 30, y: 30, w: 40, h: 40
            };
            updateSlideElements(activeSlide.id, [...(activeSlide.elements || []), newEl]);
            setSelectedElementId(newEl.id);
        };
        reader.readAsDataURL(file);
        // Reset input
        e.target.value = '';
    };

    const deleteSelectedElement = () => {
        if (!activeSlide || !selectedElementId) return;
        const newElements = activeSlide.elements?.filter(el => el.id !== selectedElementId) || [];
        updateSlideElements(activeSlide.id, newElements);
        setSelectedElementId(null);
    };

    const deleteSlide = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        if (slides.length <= 1) {
            alert('Cannot delete the last slide');
            return;
        }

        const newSlides = slides.filter((_, i) => i !== index);
        setSlides(newSlides);

        // Adjust active index if needed
        if (activeSlideIndex >= newSlides.length) {
            setActiveSlideIndex(newSlides.length - 1);
        } else if (activeSlideIndex === index) {
            // If we deleted the active slide, it stays at the same index unless it was the last one (handled above)
            // But we might want to ensure it points to the new slide at this index
            setActiveSlideIndex(Math.min(index, newSlides.length - 1));
        } else if (activeSlideIndex > index) {
            // If we deleted a slide before the active one, decrement index
            setActiveSlideIndex(activeSlideIndex - 1);
        }
    };

    // --- Toolbar Actions ---

    const execCmd = (cmd: string, value?: string) => {
        document.execCommand(cmd, false, value);
        checkToolbarState();
    };

    const checkToolbarState = () => {
        setIsBold(document.queryCommandState('bold'));
        setIsItalic(document.queryCommandState('italic'));
    };

    // --- Image Generation ---

    const generateImage = async (slideId: string, prompt: string) => {
        if (!prompt) return;
        setGeneratingImage(slideId);

        try {
            const res = await apiClient.post('/generate/image', { prompt });
            const requestId = res.data.requestId;

            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await apiClient.get(`/generate/${requestId}`);
                    const status = statusRes.data.status.status;
                    console.log('[PresentationEditor] Poll status:', status);

                    if (status === 'completed') {
                        clearInterval(pollInterval);
                        const imageUrl = statusRes.data.result.imageUrl;
                        if (imageUrl) {
                            // Add as new image element
                            const newEl: SlideElement = {
                                id: `el-${Date.now()}-gen`,
                                type: 'image',
                                content: imageUrl,
                                x: 30, y: 30, w: 40, h: 40
                            };
                            // Need to find the slide again as state might have changed
                            setSlides(prev => prev.map(s => {
                                if (s.id === slideId) {
                                    return { ...s, elements: [...(s.elements || []), newEl] };
                                }
                                return s;
                            }));
                        }
                        setGeneratingImage(null);
                    } else if (status === 'failed') {
                        clearInterval(pollInterval);
                        setGeneratingImage(null);
                        alert('Image generation failed');
                    }
                } catch (e) {
                    clearInterval(pollInterval);
                    setGeneratingImage(null);
                }
            }, 2000);
        } catch (e) {
            console.error(e);
            setGeneratingImage(null);
            alert('Failed to start image generation');
        }
    };

    // --- Export ---

    const exportToPptx = () => {
        const pres = new pptxgen();

        slides.forEach(slide => {
            const pptxSlide = pres.addSlide();

            // Background
            if (globalTheme === 'dark') pptxSlide.background = { color: '111827' };
            if (globalTheme === 'blue') pptxSlide.background = { color: 'EFF6FF' };
            if (globalTheme === 'orange') pptxSlide.background = { color: 'FFF7ED' };

            // Logo
            if (LOGO_BASE64) {
                pptxSlide.addImage({ data: LOGO_BASE64, x: '90%', y: '90%', w: 1, h: 1 });
            }

            // Elements
            slide.elements?.forEach(el => {
                const x = el.x / 100 * 10; // Approx 10 inches width
                const y = el.y / 100 * 5.625; // Approx 5.625 inches height (16:9)
                const w = el.w / 100 * 10;
                const h = el.h / 100 * 5.625;

                if (el.type === 'image') {
                    pptxSlide.addImage({ path: el.content, x, y, w, h });
                } else if (el.type === 'video') {
                    // pptxgenjs supports video from URL or base64
                    // If base64, it needs to be 'data:video/mp4;base64,...'
                    pptxSlide.addMedia({ type: 'video', data: el.content, x, y, w, h });
                } else if (el.type === 'table' && el.tableData) {
                    pptxSlide.addTable(el.tableData as any, { x, y, w, h, fontSize: 12, border: { pt: 1, color: '000000' } });
                } else if (el.type === 'shape' && el.shapeType) {
                    let shape = pres.ShapeType.rect;
                    if (el.shapeType === 'circle') shape = pres.ShapeType.ellipse;
                    if (el.shapeType === 'line') shape = pres.ShapeType.line;
                    if (el.shapeType === 'arrow') shape = pres.ShapeType.line; // Arrow needs options

                    pptxSlide.addShape(shape, {
                        x, y, w, h,
                        fill: el.style?.fillColor ? { color: el.style.fillColor.replace('#', '') } : undefined,
                        line: { color: el.style?.strokeColor?.replace('#', '') || '000000', width: el.style?.strokeWidth || 1 },
                        lineHead: el.shapeType === 'arrow' ? 'arrow' : undefined
                    });
                } else if (el.type === 'text') {
                    // Strip HTML for PPTX (basic support)
                    const text = el.content.replace(/<[^>]+>/g, ' ').trim();
                    pptxSlide.addText(text, { x, y, w, h, fontSize: 14, color: globalTheme === 'dark' ? 'FFFFFF' : '000000' });
                }
            });
        });

        pres.writeFile({ fileName: 'Presentation.pptx' });
    };

    if (!activeSlide) {
        return <div className="p-8 text-center text-gray-500">No slides available. Add a slide to start.</div>;
    }

    return (
        <div className="flex h-full bg-gray-100" onMouseUp={() => checkToolbarState()} onKeyUp={() => checkToolbarState()}>
            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*"
                onChange={handleFileUpload}
            />

            <FormulaInsertModal
                isOpen={showFormulaModal}
                onClose={() => setShowFormulaModal(false)}
                onInsert={handleInsertFormula}
            />

            {isExporting && (
                <PDFExporter
                    slides={slides}
                    theme={globalTheme}
                    onComplete={() => setIsExporting(false)}
                />
            )}

            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-700">Slides</h2>
                    <button onClick={() => {
                        const newSlide: Slide = {
                            id: `slide-${Date.now()}`,
                            type: 'content',
                            title: 'New Slide',
                            elements: [{ id: 'title', type: 'text', content: 'New Slide', x: 10, y: 10, w: 80, h: 15 }]
                        };
                        setSlides([...slides, newSlide]);
                        setActiveSlideIndex(slides.length);
                    }} className="p-1 hover:bg-gray-100 rounded-full text-blue-600">
                        <Plus size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {slides.map((slide, index) => (
                        <div
                            key={slide.id}
                            onClick={() => setActiveSlideIndex(index)}
                            className={`relative group cursor-pointer border-2 rounded-lg p-2 transition-all ${index === activeSlideIndex ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                        >
                            <div className={`aspect-video shadow-sm rounded flex flex-col p-2 overflow-hidden pointer-events-none relative ${THEMES[globalTheme].bg}`}>
                                <div className={`text-[6px] ${THEMES[globalTheme].text}`}>
                                    {slide.elements?.filter(e => e.type === 'text').map(e => e.content.replace(/<[^>]+>/g, ' ')).join(' ').slice(0, 50)}...
                                </div>
                            </div>
                            <div className="absolute bottom-1 left-2 text-xs text-gray-400 font-mono">{index + 1}</div>

                            {/* Delete Slide Button */}
                            {slides.length > 1 && (
                                <button
                                    onClick={(e) => deleteSlide(e, index)}
                                    className="absolute top-1 right-1 p-1 bg-white/80 hover:bg-red-100 text-gray-500 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    title="Delete Slide"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Editor */}
            <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2 border-r pr-4">
                            <button className={`p-1.5 rounded hover:bg-gray-100 text-gray-900 ${isBold ? 'bg-gray-200' : ''}`} onClick={() => execCmd('bold')}>
                                <Bold size={18} />
                            </button>
                            <button className={`p-1.5 rounded hover:bg-gray-100 text-gray-900 ${isItalic ? 'bg-gray-200' : ''}`} onClick={() => execCmd('italic')}>
                                <Italic size={18} />
                            </button>

                            {/* Font Size Selector */}
                            <select
                                onChange={(e) => execCmd('fontSize', e.target.value)}
                                className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 w-20"
                                defaultValue="3"
                            >
                                <option value="1">Small</option>
                                <option value="3">Normal</option>
                                <option value="5">Large</option>
                                <option value="7">Huge</option>
                            </select>

                            <div className="w-px h-6 bg-gray-300 mx-2" />

                            <select
                                value={globalTheme}
                                onChange={(e) => setGlobalTheme(e.target.value as any)}
                                className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                            >
                                <option value="light">Light Theme</option>
                                <option value="dark">Dark Theme</option>
                                <option value="blue">Blue Theme</option>
                                <option value="orange">Orange Theme</option>
                            </select>
                        </div>

                        {/* New Tools */}
                        <div className="flex items-center space-x-2">
                            <button onClick={addTextElement} className="p-1.5 rounded hover:bg-gray-100 text-gray-900 flex items-center gap-1" title="Add Text">
                                <Type size={18} />
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded hover:bg-gray-100 text-gray-900 flex items-center gap-1" title="Upload Media">
                                <Upload size={18} />
                            </button>
                            <button onClick={addTableElement} className="p-1.5 rounded hover:bg-gray-100 text-gray-900 flex items-center gap-1" title="Add Table">
                                <TableIcon size={18} />
                            </button>
                            <button onClick={() => setShowFormulaModal(true)} className="p-1.5 rounded hover:bg-gray-100 text-gray-900 flex items-center gap-1" title="Insert Formula">
                                <Pi size={18} />
                            </button>

                            {/* Shapes Dropdown (Simplified as buttons for now) */}
                            <div className="flex items-center border-l pl-2 space-x-1">
                                <button onClick={() => addShapeElement('rect')} className="p-1.5 rounded hover:bg-gray-100 text-gray-900" title="Rectangle">
                                    <Square size={16} />
                                </button>
                                <button onClick={() => addShapeElement('circle')} className="p-1.5 rounded hover:bg-gray-100 text-gray-900" title="Circle">
                                    <Circle size={16} />
                                </button>
                                <button onClick={() => addShapeElement('line')} className="p-1.5 rounded hover:bg-gray-100 text-gray-900" title="Line">
                                    <Minus size={16} />
                                </button>
                                <button onClick={() => addShapeElement('arrow')} className="p-1.5 rounded hover:bg-gray-100 text-gray-900" title="Arrow">
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>

                        {selectedElementId && (
                            <button onClick={deleteSelectedElement} className="p-1.5 rounded hover:bg-red-100 text-red-600 ml-4">
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>

                </div>


                {/* Canvas */}
                <div className="flex-1 p-8 overflow-y-auto flex justify-center items-start" onClick={() => setSelectedElementId(null)}>
                    <div
                        ref={containerRef}
                        className={`w-full max-w-4xl aspect-video shadow-lg rounded-lg relative transition-colors ${currentTheme.bg} ${currentTheme.text}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {activeSlide.elements?.map(el => (
                            <DraggableResizable
                                key={el.id}
                                element={el}
                                isSelected={selectedElementId === el.id}
                                onSelect={() => setSelectedElementId(el.id)}
                                onUpdate={updateElement}
                                containerRef={containerRef}
                            >
                                {el.type === 'text' && (
                                    <div onDoubleClick={() => setEditingElementId(el.id)} className="w-full h-full">
                                        <RichTextEditor
                                            content={el.content}
                                            isSelected={editingElementId === el.id}
                                            onChange={(newContent: string) => updateElement(el.id, { content: newContent })}
                                            onBlur={() => setEditingElementId(null)}
                                        />
                                    </div>
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
                                                            <div
                                                                contentEditable
                                                                suppressContentEditableWarning
                                                                onBlur={(e) => {
                                                                    const newData = [...(el.tableData || [])];
                                                                    newData[rIndex][cIndex] = e.currentTarget.innerText;
                                                                    updateElement(el.id, { tableData: newData });
                                                                }}
                                                            >
                                                                {cell}
                                                            </div>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {el.type === 'shape' && (
                                    <svg className="w-full h-full overflow-visible">
                                        {el.shapeType === 'rect' && (
                                            <rect width="100%" height="100%" fill={el.style?.fillColor} stroke={el.style?.strokeColor} strokeWidth={el.style?.strokeWidth} />
                                        )}
                                        {el.shapeType === 'circle' && (
                                            <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={el.style?.fillColor} stroke={el.style?.strokeColor} strokeWidth={el.style?.strokeWidth} />
                                        )}
                                        {el.shapeType === 'line' && (
                                            <line x1="0" y1="50%" x2="100%" y2="50%" stroke={el.style?.strokeColor} strokeWidth={el.style?.strokeWidth} />
                                        )}
                                        {el.shapeType === 'arrow' && (
                                            <>
                                                <defs>
                                                    <marker id={`arrow-${el.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                                                        <path d="M0,0 L0,6 L9,3 z" fill={el.style?.strokeColor} />
                                                    </marker>
                                                </defs>
                                                <line x1="0" y1="50%" x2="100%" y2="50%" stroke={el.style?.strokeColor} strokeWidth={el.style?.strokeWidth} markerEnd={`url(#arrow-${el.id})`} />
                                            </>
                                        )}
                                    </svg>
                                )}
                            </DraggableResizable>
                        ))}

                        {/* Image Generator Placeholder (if needed) */}
                        {activeSlide.imageDescription && !activeSlide.elements?.some(e => e.type === 'image') && (
                            <div className="absolute bottom-4 left-4 z-20">
                                <button
                                    onClick={() => generateImage(activeSlide.id, activeSlide.imageDescription!)}
                                    disabled={generatingImage === activeSlide.id}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-lg"
                                >
                                    {generatingImage === activeSlide.id ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                                    Generate AI Image
                                </button>
                            </div>
                        )}

                        {/* Logo Overlay */}
                        {LOGO_BASE64 && (
                            <div className="absolute bottom-4 right-4 w-16 h-16 opacity-50 pointer-events-none z-0">
                                <img src={LOGO_BASE64} alt="Logo" className="w-full h-full object-contain" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

PresentationEditor.displayName = 'PresentationEditor';

export default PresentationEditor;
