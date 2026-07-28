import {
  CanvasPresentation,
  PresentationCanvasService,
  convertPresentationDataToCanvas,
} from './presentation-canvas.service';
import { PresentationData } from './presentation-template.service';

const semantic: PresentationData = {
  topic: 'Безопасная презентация',
  audience: 'students',
  style: 'modern',
  color: 'indigo',
  slides: Array.from({ length: 5 }, (_, index) => ({
    layout: index === 0 ? 'title' as const : 'bullets' as const,
    title: `Слайд ${index + 1}`,
    subtitle: index === 0 ? 'Введение' : undefined,
    items: index === 0 ? undefined : ['Первый пункт', 'Второй пункт'],
  })),
};

describe('PresentationCanvasService', () => {
  const filesService = {
    getFileForUser: jest.fn(),
  };
  const service = new PresentationCanvasService(filesService as any);

  beforeEach(() => jest.clearAllMocks());

  it('детерминированно конвертирует старую presentationData в canvas 16:9', () => {
    const first = convertPresentationDataToCanvas(semantic);
    const second = convertPresentationDataToCanvas(semantic);

    expect(first).toEqual(second);
    expect(first.format).toBe('presentation-canvas-v1');
    expect(first.width).toBe(1280);
    expect(first.height).toBe(720);
    expect(first.slides).toHaveLength(5);
    expect(first.slides[0].elements.some((element) => element.type === 'text')).toBe(true);
  });

  it('принимает тонкие разделители из two-column legacy-конвертера', () => {
    const withDivider: PresentationData = {
      ...semantic,
      slides: semantic.slides.map((slide, index) => index === 2 ? {
        layout: 'two-column',
        title: 'Сравнение',
        leftTitle: 'Слева',
        leftText: 'Описание слева',
        rightTitle: 'Справа',
        rightText: 'Описание справа',
      } : slide),
    };

    const canvas = convertPresentationDataToCanvas(withDivider);
    const divider = canvas.slides[2].elements.find((element) =>
      element.id.endsWith('-divider'),
    );

    expect(divider?.width).toBe(2);
    expect(() => service.parse(canvas)).not.toThrow();
  });

  it('экранирует пользовательский текст и не создаёт исполняемый script', async () => {
    const canvas = convertPresentationDataToCanvas(semantic);
    canvas.slides[0].elements.push({
      id: 'xss',
      type: 'text',
      x: 20,
      y: 20,
      width: 300,
      height: 100,
      rotation: 0,
      zIndex: 5,
      text: '</script><script>alert(1)</script>',
      style: {},
    });

    const html = await service.renderHtml(canvas);

    expect(html).toContain('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('</script><script>alert(1)</script>');
  });

  it('масштабирует горизонтальный слайд целиком в вертикальную PDF-страницу', async () => {
    const canvas = convertPresentationDataToCanvas(semantic);
    const html = await service.renderHtml(canvas, {
      printPageSize: { width: 720, height: 1280 },
    });

    expect(html).toContain('@page{size:720px 1280px');
    expect(html).toContain('class="slide-page"');
    expect(html).toContain('scale(0.5625)');
  });

  it('встраивает только принадлежащий пользователю image asset', async () => {
    filesService.getFileForUser.mockResolvedValue({
      mimeType: 'image/png',
      buffer: Buffer.from('png'),
    });
    const canvas: CanvasPresentation = convertPresentationDataToCanvas(semantic);
    canvas.slides[0].elements.push({
      id: 'owned-image',
      type: 'image',
      assetHash: 'a'.repeat(32),
      x: 20,
      y: 20,
      width: 300,
      height: 200,
      rotation: 0,
      zIndex: 5,
      style: { objectFit: 'cover' },
    });

    const html = await service.renderHtml(canvas, { userId: 'user-1', embedAssets: true });

    expect(filesService.getFileForUser).toHaveBeenCalledWith('a'.repeat(32), 'user-1');
    expect(html).toContain('data:image/png;base64,cG5n');
  });

  it('отклоняет сверхлимитные презентации', () => {
    const canvas = convertPresentationDataToCanvas(semantic) as any;
    canvas.slides = Array.from({ length: 25 }, () => canvas.slides[0]);
    expect(() => service.parse(canvas)).toThrow();
  });
});
