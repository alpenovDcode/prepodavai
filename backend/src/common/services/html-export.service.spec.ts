import {
  getPdfPageGeometry,
  isAllowedProtectedPdfRequest,
} from './html-export.service';

describe('isAllowedProtectedPdfRequest', () => {
  it('allows only the exact HTTPS jsDelivr hostname for external requests', () => {
    expect(isAllowedProtectedPdfRequest('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js')).toBe(true);
    expect(isAllowedProtectedPdfRequest('http://cdn.jsdelivr.net/mathjax.js')).toBe(false);
    expect(isAllowedProtectedPdfRequest('https://cdn.jsdelivr.net.attacker.test/payload.js')).toBe(false);
    expect(isAllowedProtectedPdfRequest('https://cdn.jsdelivr.net@127.0.0.1/metadata')).toBe(false);
  });

  it('blocks arbitrary network and malformed URLs but keeps inline resources', () => {
    expect(isAllowedProtectedPdfRequest('http://127.0.0.1:3000/private')).toBe(false);
    expect(isAllowedProtectedPdfRequest('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedProtectedPdfRequest('https://example.com/image.png')).toBe(false);
    expect(isAllowedProtectedPdfRequest('not a url')).toBe(false);
    expect(isAllowedProtectedPdfRequest('file:///etc/passwd')).toBe(false);
    expect(isAllowedProtectedPdfRequest('javascript:alert(1)')).toBe(false);
    expect(isAllowedProtectedPdfRequest('data:image/png;base64,AAAA')).toBe(true);
    expect(isAllowedProtectedPdfRequest('blob:https://app.test/id')).toBe(true);
  });
});

describe('getPdfPageGeometry', () => {
  it('uses the requested pixel dimensions without Chromium landscape swapping', () => {
    const geometry = getPdfPageGeometry({
      landscape: false,
      pageSize: { width: 1280, height: 720 },
    });

    expect(geometry).toEqual({ width: '1280px', height: '720px' });
    expect(geometry).not.toHaveProperty('landscape');
  });

  it('keeps the A4 landscape option for regular documents', () => {
    expect(getPdfPageGeometry({ landscape: true })).toEqual({
      format: 'A4',
      landscape: true,
    });
  });
});
