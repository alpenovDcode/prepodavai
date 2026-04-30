import React from 'react';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { Slide, SlideDoc, SlideLayout, SlideThemeId, SLIDE_THEMES } from '@/types/slide-doc';
import {
  updateSlide,
  updateSlideContent,
  setBullets,
  updateColumn,
  updateQuote,
  updateQuiz,
  setLayout,
  setTheme,
} from '@/lib/utils/slide-doc-mutations';

interface Props {
  doc: SlideDoc;
  slideIdx: number;
  onChange: (doc: SlideDoc) => void;
  onRegenerateImage?: (slideIdx: number) => Promise<void>;
  regeneratingImage?: boolean;
}

const LAYOUTS: { value: SlideLayout; label: string }[] = [
  { value: 'title', label: 'Обложка' },
  { value: 'agenda', label: 'Цели' },
  { value: 'bullets', label: 'Список' },
  { value: 'two-column', label: '2 колонки' },
  { value: 'image-text', label: 'Текст + картинка' },
  { value: 'quote', label: 'Цитата' },
  { value: 'quiz', label: 'Вопрос' },
  { value: 'summary', label: 'Итоги' },
];

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-3">
    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">{label}</label>
    {children}
  </div>
);

const TextInput: React.FC<{
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}> = ({ value, onChange, placeholder, multiline }) => {
  const cls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent transition';
  return multiline ? (
    <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${cls} resize-none`} />
  ) : (
    <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
  );
};

const BulletEditor: React.FC<{
  bullets: string[] | undefined;
  onChange: (bullets: string[]) => void;
}> = ({ bullets, onChange }) => {
  const items = bullets || [];
  return (
    <div className="space-y-1.5">
      {items.map((b, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            value={b}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition"
            title="Удалить пункт"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ''])}
        className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700 mt-1"
      >
        <Plus className="w-3 h-3" /> Добавить пункт
      </button>
    </div>
  );
};

export const SlideDocInspector: React.FC<Props> = ({
  doc,
  slideIdx,
  onChange,
  onRegenerateImage,
  regeneratingImage,
}) => {
  const slide: Slide | undefined = doc.slides[slideIdx];
  if (!slide) return null;

  const c = slide.content;
  const set = (next: SlideDoc) => onChange(next);

  return (
    <aside className="w-full md:w-[320px] bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden flex-shrink-0">
      <div className="p-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-sm text-gray-900">Слайд {slideIdx + 1}</h3>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">{slide.layout}</span>
        </div>
        <p className="text-xs text-gray-500">из {doc.slides.length}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-200">
        <Field label="Тема презентации">
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.keys(SLIDE_THEMES) as SlideThemeId[]).map((id) => {
              const t = SLIDE_THEMES[id];
              const selected = id === doc.themeId;
              return (
                <button
                  key={id}
                  onClick={() => set(setTheme(doc, id))}
                  className={`aspect-square rounded-md border-2 transition ${selected ? 'border-gray-900 scale-105' : 'border-gray-200 hover:border-gray-400'}`}
                  style={{ background: t.accent }}
                  title={t.label}
                />
              );
            })}
          </div>
        </Field>

        <Field label="Лейаут слайда">
          <select
            value={slide.layout}
            onChange={(e) => set(setLayout(doc, slideIdx, e.target.value as SlideLayout))}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
          >
            {LAYOUTS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </Field>

        <div className="border-t border-gray-100 my-3" />

        <Field label="Заголовок">
          <TextInput
            value={c.title}
            onChange={(v) => set(updateSlideContent(doc, slideIdx, 'title', v))}
            placeholder="Заголовок слайда"
          />
        </Field>

        {(slide.layout === 'title' || slide.layout === 'bullets') && (
          <Field label="Подзаголовок">
            <TextInput
              value={c.subtitle}
              onChange={(v) => set(updateSlideContent(doc, slideIdx, 'subtitle', v))}
              placeholder="Опционально"
            />
          </Field>
        )}

        {(slide.layout === 'agenda' ||
          slide.layout === 'bullets' ||
          slide.layout === 'summary' ||
          slide.layout === 'image-text') && (
          <Field label="Маркеры">
            <BulletEditor
              bullets={c.bullets}
              onChange={(next) => set(setBullets(doc, slideIdx, next))}
            />
          </Field>
        )}

        {slide.layout === 'two-column' && (
          <>
            <Field label="Левая колонка — заголовок">
              <TextInput
                value={c.leftColumn?.heading}
                onChange={(v) => set(updateColumn(doc, slideIdx, 'leftColumn', { heading: v }))}
              />
            </Field>
            <Field label="Левая колонка — пункты">
              <BulletEditor
                bullets={c.leftColumn?.bullets}
                onChange={(next) => set(updateColumn(doc, slideIdx, 'leftColumn', { bullets: next }))}
              />
            </Field>
            <Field label="Правая колонка — заголовок">
              <TextInput
                value={c.rightColumn?.heading}
                onChange={(v) => set(updateColumn(doc, slideIdx, 'rightColumn', { heading: v }))}
              />
            </Field>
            <Field label="Правая колонка — пункты">
              <BulletEditor
                bullets={c.rightColumn?.bullets}
                onChange={(next) => set(updateColumn(doc, slideIdx, 'rightColumn', { bullets: next }))}
              />
            </Field>
          </>
        )}

        {slide.layout === 'quote' && (
          <>
            <Field label="Текст цитаты">
              <TextInput
                value={c.quote?.text}
                onChange={(v) => set(updateQuote(doc, slideIdx, { text: v }))}
                multiline
              />
            </Field>
            <Field label="Автор">
              <TextInput
                value={c.quote?.attribution}
                onChange={(v) => set(updateQuote(doc, slideIdx, { attribution: v }))}
              />
            </Field>
          </>
        )}

        {slide.layout === 'quiz' && c.quiz && (
          <>
            <Field label="Вопрос">
              <TextInput
                value={c.quiz.question}
                onChange={(v) => set(updateQuiz(doc, slideIdx, { question: v }))}
                multiline
              />
            </Field>
            <Field label="Варианты ответа">
              <div className="space-y-1.5">
                {c.quiz.options.map((opt, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <button
                      onClick={() => set(updateQuiz(doc, slideIdx, { answerIndex: i }))}
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${i === c.quiz!.answerIndex ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}
                      title={i === c.quiz!.answerIndex ? 'Правильный ответ' : 'Отметить как правильный'}
                    />
                    <input
                      value={opt}
                      onChange={(e) => {
                        const next = [...c.quiz!.options];
                        next[i] = e.target.value;
                        set(updateQuiz(doc, slideIdx, { options: next }));
                      }}
                      className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    />
                    {c.quiz!.options.length > 2 && (
                      <button
                        onClick={() => {
                          const next = c.quiz!.options.filter((_, j) => j !== i);
                          const nextAnswer = c.quiz!.answerIndex >= next.length ? next.length - 1 : c.quiz!.answerIndex;
                          set(updateQuiz(doc, slideIdx, { options: next, answerIndex: nextAnswer }));
                        }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {c.quiz.options.length < 6 && (
                  <button
                    onClick={() => set(updateQuiz(doc, slideIdx, { options: [...c.quiz!.options, ''] }))}
                    className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700 mt-1"
                  >
                    <Plus className="w-3 h-3" /> Добавить вариант
                  </button>
                )}
              </div>
            </Field>
          </>
        )}

        {slide.layout === 'image-text' && (
          <>
            <Field label="Описание изображения (промпт)">
              <TextInput
                value={slide.image?.prompt}
                onChange={(v) =>
                  set(updateSlide(doc, slideIdx, (s) => ({
                    ...s,
                    image: { ...(s.image || {}), prompt: v },
                  })))
                }
                placeholder="educational illustration, clean..."
                multiline
              />
            </Field>
            {slide.image?.url && (
              <div className="mb-3 rounded-lg overflow-hidden border border-gray-200">
                <img src={slide.image.url} alt={slide.image.alt || ''} className="w-full h-auto" />
              </div>
            )}
            {onRegenerateImage && slide.image?.prompt && (
              <button
                onClick={() => onRegenerateImage(slideIdx)}
                disabled={regeneratingImage}
                className="w-full flex items-center justify-center gap-2 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
              >
                {regeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {slide.image.url ? 'Перегенерировать' : 'Создать картинку'}
              </button>
            )}
          </>
        )}

        <div className="border-t border-gray-100 my-3" />

        <Field label="Заметки для учителя">
          <TextInput
            value={slide.speakerNotes}
            onChange={(v) =>
              set(updateSlide(doc, slideIdx, { speakerNotes: v }))
            }
            multiline
            placeholder="Что сказать на этом слайде..."
          />
        </Field>
      </div>
    </aside>
  );
};
