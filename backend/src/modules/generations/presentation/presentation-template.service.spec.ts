import { serializeForInlineScript } from './presentation-template.service';

describe('serializeForInlineScript', () => {
  it('does not allow user content to close the containing script tag', () => {
    const payload = {
      slides: [
        {
          layout: 'title',
          title: '</script><script>window.top.location="https://evil.test"</script>',
        },
      ],
    };

    const serialized = serializeForInlineScript(payload);

    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(serialized)).toEqual(payload);
  });

  it('escapes ampersands and JavaScript line separators without changing data', () => {
    const payload = { text: `A&B\u2028C\u2029D` };
    const serialized = serializeForInlineScript(payload);

    expect(serialized).toContain('\\u0026');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(JSON.parse(serialized)).toEqual(payload);
  });
});
