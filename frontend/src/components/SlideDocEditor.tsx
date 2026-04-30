import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, Copy, ArrowUp, ArrowDown, Save, Check, Loader2,
} from 'lucide-react';
import { SlideDoc, SlideTheme, pickSlideTheme } from '@/types/slide-doc';
import { SlideDocSlide } from './SlideDocRenderer';
import { SlideDocInspector } from './SlideDocInspector';
import {
  insertSlide, deleteSlide, duplicateSlide, moveSlide, updateSlide,
} from '@/lib/utils/slide-doc-mutations';

interface Props {
  initialDoc: SlideDoc;
  onSave?: (doc: SlideDoc) => Promise<void>;
  onRegenerateImage?: (slideIdx: number, prompt: string) => Promise<string | null>;
}

const Thumbnail: React.FC<{
  doc: SlideDoc;
  slideIdx: number;
  isActive: boolean;
  theme: SlideTheme;
  onClick: () => void;
}> = ({ doc, slideIdx, isActive, theme, onClick }) => {
  const slide = doc.slides[slideIdx];
  return (
    <button
      onClick={onClick}
      className={`relative w-full aspect-video rounded-md overflow-hidden border-2 transition flex-shrink-0 ${isActive ? 'border-purple-500 shadow-md' : 'border-gray-200 hover:border-purple-300'}`}
    >
      <div
        className="absolute inset-0"
        style={{
          width: '1280px',
          height: '720px',
          transform: 'scale(0.12)',
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        <SlideDocSlide slide={slide} theme={theme} />
      </div>
      <span className="absolute bottom-1 left-1.5 text-[9px] font-bold bg-black/50 text-white rounded px-1 py-0.5">
        {slideIdx + 1}
      </span>
    </button>
  );
};

export const SlideDocEditor: React.FC<Props> = ({ initialDoc, onSave, onRegenerateImage }) => {
  const [doc, setDoc] = useState<SlideDoc>(initialDoc);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState(false);

  // Reset on new initialDoc (new generation)
  const lastInitId = useRef<string>('');
  useEffect(() => {
    const key = `${initialDoc.createdAt}-${initialDoc.slides.length}`;
    if (key === lastInitId.current) return;
    lastInitId.current = key;
    setDoc(initialDoc);
    setActiveIdx(0);
    setIsDirty(false);
    setSavedAt(null);
  }, [initialDoc]);

  const theme = pickSlideTheme(doc.themeId);

  const update = useCallback((next: SlideDoc) => {
    setDoc(next);
    setIsDirty(true);
  }, []);

  const handleAddSlide = () => {
    const next = insertSlide(doc, activeIdx, 'bullets');
    update(next);
    setActiveIdx(activeIdx + 1);
  };

  const handleDelete = () => {
    if (doc.slides.length <= 1) return;
    update(deleteSlide(doc, activeIdx));
    setActiveIdx(Math.max(0, activeIdx - 1));
  };

  const handleDuplicate = () => {
    update(duplicateSlide(doc, activeIdx));
    setActiveIdx(activeIdx + 1);
  };

  const handleMove = (delta: -1 | 1) => {
    const target = activeIdx + delta;
    if (target < 0 || target >= doc.slides.length) return;
    update(moveSlide(doc, activeIdx, delta));
    setActiveIdx(target);
  };

  const handleSave = async () => {
    if (!onSave || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(doc);
      setIsDirty(false);
      setSavedAt(Date.now());
    } catch (e) {
      console.error('Save failed', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateImage = async (slideIdx: number) => {
    if (!onRegenerateImage) return;
    const slide = doc.slides[slideIdx];
    const prompt = slide.image?.prompt;
    if (!prompt) return;
    setRegeneratingImage(true);
    try {
      const url = await onRegenerateImage(slideIdx, prompt);
      if (url) {
        update(
          updateSlide(doc, slideIdx, (s) => ({
            ...s,
            image: { ...(s.image || { prompt }), url },
          })),
        );
      }
    } finally {
      setRegeneratingImage(false);
    }
  };

  const activeSlide = doc.slides[activeIdx];

  return (
    <div className="flex flex-col w-full h-full bg-[#F9FAFB] overflow-hidden">
      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={handleAddSlide} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-gray-100 rounded-md text-sm font-medium text-gray-700 transition">
            <Plus className="w-4 h-4" /> Добавить
          </button>
          <button onClick={handleDuplicate} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-gray-100 rounded-md text-sm font-medium text-gray-700 transition">
            <Copy className="w-4 h-4" /> Дублировать
          </button>
          <button onClick={() => handleMove(-1)} disabled={activeIdx === 0} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-700 transition disabled:opacity-30">
            <ArrowUp className="w-4 h-4" />
          </button>
          <button onClick={() => handleMove(1)} disabled={activeIdx === doc.slides.length - 1} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-700 transition disabled:opacity-30">
            <ArrowDown className="w-4 h-4" />
          </button>
          <button onClick={handleDelete} disabled={doc.slides.length <= 1} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-red-50 rounded-md text-sm font-medium text-red-600 transition disabled:opacity-30">
            <Trash2 className="w-4 h-4" /> Удалить
          </button>
        </div>

        <div className="flex items-center gap-3">
          {savedAt && !isDirty && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <Check className="w-3.5 h-3.5" /> Сохранено
            </span>
          )}
          {isDirty && <span className="text-xs text-orange-500 font-medium">Несохранённые изменения</span>}
          {onSave && (
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnails sidebar */}
        <div className="w-[160px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Слайды</span>
            <span className="text-[10px] text-gray-400">{doc.slides.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-200">
            {doc.slides.map((s, i) => (
              <Thumbnail
                key={s.id}
                doc={doc}
                slideIdx={i}
                isActive={i === activeIdx}
                theme={theme}
                onClick={() => setActiveIdx(i)}
              />
            ))}
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            {activeSlide && (
              <div
                className="bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200"
                style={{ width: '100%', maxWidth: '960px', aspectRatio: '16/9' }}
              >
                <SlideDocSlide slide={activeSlide} theme={theme} />
              </div>
            )}
          </div>
        </div>

        {/* Inspector */}
        <SlideDocInspector
          doc={doc}
          slideIdx={activeIdx}
          onChange={update}
          onRegenerateImage={onRegenerateImage ? handleRegenerateImage : undefined}
          regeneratingImage={regeneratingImage}
        />
      </div>
    </div>
  );
};
