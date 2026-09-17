import { stripAnswerKeyFromHtml } from './strip-answer-key.util';

const pick = (value: any, keys: string[]): Record<string, any> =>
  Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

/** Public projection, not the stored document. Unknown fields/types are never sent. */
function studentBlock(block: any): any | null {
  if (!block || typeof block !== 'object') return null;
  const base = pick(block, ['id', 'type']);
  const plainFields: Record<string, string[]> = {
    heading: ['level', 'text'], paragraph: ['text'],
    callout: ['variant', 'title', 'text'], spacer: ['size'],
    'math-display': ['latex', 'caption'], image: ['src', 'alt', 'caption'],
    table: ['headers', 'rows', 'caption'],
    'vocab-entry': ['term', 'translation', 'transcription', 'partOfSpeech', 'example', 'exampleTranslation', 'note'],
  };
  if (Object.prototype.hasOwnProperty.call(plainFields, block.type)) {
    return { ...base, ...pick(block, plainFields[block.type]) };
  }
  switch (block.type) {
    case 'multiple-choice':
      return { ...base, ...pick(block, ['question', 'multiple']),
        options: (Array.isArray(block.options) ? block.options : []).map((option: any) => ({
          ...pick(option, ['id', 'text']), correct: false,
        })),
      };
    case 'fill-blank':
      return { ...base, ...pick(block, ['template']),
        blanks: (Array.isArray(block.blanks) ? block.blanks : []).map((blank: any) => ({
          ...pick(blank, ['index', 'hint']), answer: '',
        })),
      };
    case 'short-answer':
      return { ...base, ...pick(block, ['question', 'expectedLength']) };
    case 'matching':
      return { ...base, ...pick(block, ['instruction']),
        left: (Array.isArray(block.left) ? block.left : []).map((item: any) => pick(item, ['id', 'text'])),
        right: (Array.isArray(block.right) ? block.right : []).map((item: any) => pick(item, ['id', 'text'])),
        pairs: [],
      };
    case 'html-snippet': {
      const html = typeof block.html === 'string' ? stripAnswerKeyFromHtml(block.html) : '';
      return html ? { ...base, html } : null;
    }
    default:
      return null;
  }
}

export function toStudentGenerationOutput(output: any): any {
  if (!output) return output;
  if (typeof output === 'string') return stripAnswerKeyFromHtml(output);
  if (typeof output !== 'object') return output;

  if (output.format === 'json-blocks-v1') {
    const doc = output.outputDoc;
    if (!doc || !Array.isArray(doc.blocks)) return null;
    // Neutral required answer fields retain compatibility with the existing
    // student renderer's Zod schema. They are not an answer key for grading.
    // Drop cached HTML, export URLs, doc.answers, meta.extra and unknown fields.
    return {
      format: 'json-blocks-v1',
      outputDoc: {
        ...pick(doc, ['schemaVersion', 'type', 'title']),
        meta: pick(doc.meta, ['subject', 'grade', 'duration', 'studentName', 'date']),
        blocks: doc.blocks.map(studentBlock).filter((block: any) => block !== null),
      },
    };
  }

  // Preserve legacy media payloads; strip marked teacher HTML as before.
  const next = { ...output };
  for (const key of ['content', 'htmlResult', 'html', 'text', 'editedBody']) {
    if (typeof next[key] === 'string') next[key] = stripAnswerKeyFromHtml(next[key]);
  }
  return next;
}
