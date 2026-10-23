import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { UpdateGenerationDto } from './generation.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: UpdateGenerationDto,
  data: '',
};

function validPresentation(slidesCount = 5) {
  return {
    topic: 'Безопасная презентация',
    audience: 'Школьники',
    style: 'modern',
    color: 'indigo',
    slides: Array.from({ length: slidesCount }, (_, index) => ({
      layout: index === 0 ? 'title' : 'content',
      title: `Слайд ${index + 1}`,
      paragraphs: index === 0 ? undefined : ['Содержимое'],
    })),
  };
}

describe('UpdateGenerationDto presentationData', () => {
  it('accepts a valid presentation and transforms nested slides', async () => {
    const result = await pipe.transform(
      { presentationData: validPresentation() },
      metadata,
    );

    expect(result.presentationData?.slides).toHaveLength(5);
  });

  it('rejects presentations with more than 24 slides', async () => {
    await expect(
      pipe.transform({ presentationData: validPresentation(25) }, metadata),
    ).rejects.toThrow();
  });

  it('rejects presentations with fewer than 5 slides', async () => {
    await expect(
      pipe.transform({ presentationData: validPresentation(4) }, metadata),
    ).rejects.toThrow();
  });

  it('rejects unknown layouts, styles and nested fields', async () => {
    const presentation = validPresentation();
    presentation.style = 'preview/../../secrets' as any;
    presentation.slides[0] = {
      ...presentation.slides[0],
      layout: 'raw-html' as any,
      dangerousHtml: '<script>alert(1)</script>',
    } as any;

    await expect(
      pipe.transform({ presentationData: presentation }, metadata),
    ).rejects.toThrow();
  });

  it('rejects non-HTTPS image schemes', async () => {
    const presentation = validPresentation();
    presentation.slides[1] = {
      ...presentation.slides[1],
      layout: 'image-text',
      imageUrl: 'file:///etc/passwd',
    } as any;

    await expect(
      pipe.transform({ presentationData: presentation }, metadata),
    ).rejects.toThrow();
  });
});
