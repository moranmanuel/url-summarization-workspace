import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeUrl,
  isPublicIPv4,
  isPublicIPv6,
  extractPage,
  fetchWebpage,
} from '../lib/server/webpage';
describe('public URL validation', () => {
  it('normalizes domains and removes fragments', () => {
    expect(normalizeUrl(' example.com/article#top ').href).toBe(
      'https://example.com/article',
    );
  });
  it.each([
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::1]',
    'http://localhost',
    'http://host.local',
    'http://example.com:8080',
    'https://user:pass@example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://169.254.169.254',
  ])('rejects %s', (url) => expect(() => normalizeUrl(url)).toThrow());
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
  ])('rejects private/reserved DNS answer %s', (ip) =>
    expect(isPublicIPv4(ip)).toBe(false),
  );
  it('accepts public DNS answers', () =>
    expect(isPublicIPv4('93.184.216.34')).toBe(true));
});
describe('readable extraction', () => {
  it('extracts an article without script or navigation content', () => {
    const result = extractPage(
      `<html><head><title>Useful article</title><script>secretScript()</script></head><body><nav>Navigation junk</nav><main><h1>Useful article</h1><p>${'An informative sentence about sustainable cities. '.repeat(30)}</p></main></body></html>`,
      'https://example.com',
    );
    expect(result.source).toContain('sustainable cities');
    expect(result.source).not.toContain('secretScript');
    expect(result.source).not.toContain('Navigation junk');
    expect(result.title).toBe('Useful article');
  });
  it('rejects blank or JavaScript-only pages', () =>
    expect(() =>
      extractPage(
        '<html><body><script>render()</script></body></html>',
        'https://example.com',
      ),
    ).toThrow(/too little/));
  it('explicitly marks context truncation', () => {
    const result = extractPage(
      'word '.repeat(15000),
      'https://example.com',
      'text/plain',
    );
    expect(result.sourceTruncated).toBe(true);
    expect(result.source).toHaveLength(60000);
    expect(result.wordCount).toBe(15000);
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('fetch boundaries', () => {
  it('does not follow a redirect into a private network', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ Answer: [{ type: 1, data: '93.184.216.34' }] }),
      )
      .mockResolvedValueOnce(Response.json({ Answer: [] }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'http://127.0.0.1/admin' },
        }),
      );
    vi.stubGlobal('fetch', mock);
    await expect(
      fetchWebpage('https://example.com', new AbortController().signal),
    ).rejects.toThrow(/public/);
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it('rejects private DNS before fetching the page', async () => {
    const mock = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ Answer: [{ type: 1, data: '10.0.0.1' }] }),
      );
    vi.stubGlobal('fetch', mock);
    await expect(
      fetchWebpage('https://example.com', new AbortController().signal),
    ).rejects.toThrow(/public/);
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

it.each([
  '::1',
  'fc00::1',
  'fe80::1',
  '::ffff:127.0.0.1',
  '2001:db8::1',
  '2002:7f00:1::',
])('rejects non-public IPv6 %s', (ip) => expect(isPublicIPv6(ip)).toBe(false));
