import React, { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Slide, SlideElement } from '@/types/presentation';
import { renderMath } from '@/lib/utils/math';
import { LOGO_BASE64 } from '@/constants/branding';
import DOMPurify from 'isomorphic-dompurify';

interface PDFExporterProps {
    slides: Slide[];
    theme: 'light' | 'dark' | 'blue' | 'orange';
    onComplete: () => void;
}

const THEMES = {
    light: { bg: 'bg-white', text: 'text-gray-900', accent: 'text-blue-600' },
    dark: { bg: 'bg-gray-900', text: 'text-white', accent: 'text-blue-400' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-900', accent: 'text-blue-700' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-900', accent: 'text-orange-700' }
};

const PDFExporter: React.FC<PDFExporterProps> = ({ slides, theme, onComplete }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const generatePDF = async () => {
            if (!containerRef.current || isProcessing) return;
            setIsProcessing(true);

            try {
                // Initial delay to ensure DOM is ready
                await new Promise(resolve => setTimeout(resolve, 500));

                // Wait for MathJax to render
                if ((window as any).MathJax?.typesetPromise) {
                    await (window as any).MathJax.typesetPromise([containerRef.current]);
                } else {
                    console.warn('MathJax not found');
                }

                // Wait a bit for images and other resources (increased to 2s)
                await new Promise(resolve => setTimeout(resolve, 2000));

                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'px',
                    format: [1920, 1080] // Use standard 1080p resolution for high quality
                });

                const slideElements = containerRef.current.querySelectorAll('.pdf-slide');

                for (let i = 0; i < slideElements.length; i++) {
                    const slideEl = slideElements[i] as HTMLElement;

                    const canvas = await html2canvas(slideEl, {
                        scale: 2, // Higher scale for better quality
                        useCORS: true,
                        logging: false,
                        backgroundColor: theme === 'dark' ? '#111827' : (theme === 'blue' ? '#EFF6FF' : (theme === 'orange' ? '#FFF7ED' : '#ffffff')),
                        windowWidth: 1920,
                        windowHeight: 1080,
                        onclone: (clonedDoc) => {
                            // Remove assistive MathML to prevent double rendering
                            const assistiveMmls = clonedDoc.querySelectorAll('mjx-assistive-mml');
                            assistiveMmls.forEach(el => el.remove());
                        }
                    });

                    const imgData = canvas.toDataURL('image/jpeg', 0.95); // High quality JPEG

                    if (i > 0) {
                        pdf.addPage([1920, 1080], 'landscape');
                    }

                    pdf.addImage(imgData, 'JPEG', 0, 0, 1920, 1080);
                }

                pdf.save('Presentation.pdf');
            } catch (error) {
                console.error('PDF Generation failed:', error);
                alert('Failed to generate PDF');
            } finally {
                onComplete();
            }
        };

        generatePDF();
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: '-10000px', // Move off-screen instead of visibility: hidden
                width: '1920px',
                height: '1080px',
                zIndex: -1000,
            }}
        >
            {slides.map((slide, index) => (
                <div
                    key={slide.id}
                    className={`pdf-slide relative w-full h-full overflow-hidden ${THEMES[theme].bg} ${THEMES[theme].text}`}
                    style={{ width: '1920px', height: '1080px' }}
                >
                    {/* Elements */}
                    {slide.elements?.map(el => (
                        <div
                            key={el.id}
                            className="absolute"
                            style={{
                                left: `${el.x}%`,
                                top: `${el.y}%`,
                                width: `${el.w}%`,
                                height: `${el.h}%`,
                                fontSize: el.style?.fontSize ? `${el.style.fontSize * 1.5}px` : undefined, // Scale up font for 1080p
                                textAlign: el.style?.textAlign,
                                color: el.style?.color,
                                backgroundColor: el.style?.bg,
                            }}
                        >
                            {el.type === 'text' && (
                                <div
                                    className="w-full h-full"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMath(el.content)) }}
                                />
                            )}
                            {el.type === 'image' && (
                                <img src={el.content} alt="Slide Content" className="w-full h-full object-contain" />
                            )}
                            {el.type === 'table' && el.tableData && (
                                <table className="w-full h-full border-collapse border border-gray-300 bg-white text-black">
                                    <tbody>
                                        {el.tableData.map((row, rIndex) => (
                                            <tr key={rIndex}>
                                                {row.map((cell, cIndex) => (
                                                    <td key={cIndex} className="border border-gray-300 p-2">
                                                        {cell}
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
                                                <marker id={`arrow-${el.id}-pdf`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                                                    <path d="M0,0 L0,6 L9,3 z" fill={el.style?.strokeColor} />
                                                </marker>
                                            </defs>
                                            <line x1="0" y1="50%" x2="100%" y2="50%" stroke={el.style?.strokeColor} strokeWidth={el.style?.strokeWidth} markerEnd={`url(#arrow-${el.id}-pdf)`} />
                                        </>
                                    )}
                                </svg>
                            )}
                        </div>
                    ))}

                    {/* Logo Overlay */}
                    {LOGO_BASE64 && (
                        <div className="absolute bottom-8 right-8 w-24 h-24 opacity-50">
                            <img src={LOGO_BASE64} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default PDFExporter;
