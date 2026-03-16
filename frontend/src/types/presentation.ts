export interface SlideElement {
    id: string;
    type: 'text' | 'image' | 'video' | 'table' | 'shape';
    content: string; // HTML for text, URL for image/video, empty for table/shape
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    w: number; // percentage 0-100
    h: number; // percentage 0-100
    shapeType?: 'rect' | 'circle' | 'line' | 'arrow';
    tableData?: string[][]; // 2D array for table content
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

export interface Slide {
    id: string;
    type: 'title' | 'content' | 'image'; // Legacy type, kept for reference
    title?: string; // Legacy
    subtitle?: string; // Legacy
    content?: string[]; // Legacy
    imageDescription?: string;
    imageUrl?: string; // Legacy
    theme?: 'light' | 'dark' | 'blue' | 'orange';
    elements?: SlideElement[]; // NEW: List of free-form elements
}
