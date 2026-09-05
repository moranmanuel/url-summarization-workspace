import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { AppError } from './errors';
const MAX_BYTES = 2_000_000;
export const MAX_SOURCE_CHARS = 60_000;
export function normalizeUrl(input: unknown): URL {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048)
    throw new AppError('Enter a valid webpage URL.');
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`,
    );
  } catch {
    throw new AppError('Enter a valid webpage URL.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes('.') ||
    !/^[a-z0-9.-]+$/.test(host) ||
    /^\d+(\.\d+)*$/.test(host) ||
    /(^|\.)(localhost|local|internal|test|invalid|home|lan)$/.test(host)
  )
    throw new AppError(
      'Use a public HTTP or HTTPS webpage URL without credentials or a custom port.',
    );
  url.hostname = host;
  url.hash = '';
  return url;
}
export function isPublicIPv4(ip: string) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}
export function isPublicIPv6(ip: string) {
  // Global unicast only; exclude transition and documentation ranges.
  return /^[23][a-f0-9]{3}:/i.test(ip) && !/^2002:|^2001:(0:|db8:)/i.test(ip);
}
async function validateDNS(url: URL, signal: AbortSignal) {
  const records = await Promise.all(
    ['A', 'AAAA'].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`,
        { headers: { Accept: 'application/dns-json' }, signal },
      );
      if (!response.ok)
        throw new AppError(
          'Could not resolve this website. Please try again.',
          502,
        );
      const data = (await response.json()) as {
        Answer?: { type: number; data: string }[];
      };
      return data.Answer ?? [];
    }),
  );
  const addresses = records.flat().filter((a) => a.type === 1 || a.type === 28);
  if (!addresses.length)
    throw new AppError('This website could not be found. Check the URL.', 422);
  if (
    addresses.some((a) =>
      a.type === 1 ? !isPublicIPv4(a.data) : !isPublicIPv6(a.data),
    )
  )
    throw new AppError('This URL does not point to a public website.');
}
export function extractPage(
  html: string,
  url: string,
  contentType = 'text/html',
) {
  let title = new URL(url).hostname,
    text = '';
  if (contentType.includes('text/plain')) text = html;
  else {
    const { document } = parseHTML(html);
    document
      .querySelectorAll(
        'script,style,noscript,svg,iframe,nav,footer,header,form',
      )
      .forEach((el) => el.remove());
    title = document.querySelector('title')?.textContent?.trim() || title;
    let article: ReturnType<Readability['parse']> = null;
    try {
      article = new Readability(document as unknown as Document, {
        charThreshold: 80,
      }).parse();
    } catch {
      /* Fall back to visible text for non-article pages. */
    }
    text =
      article?.textContent ||
      document.querySelector('main')?.textContent ||
      document.body?.textContent ||
      '';
    title = article?.title?.trim() || title;
  }
  text = text
    .replace(/[\t \u00a0]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  if (text.length < 100)
    throw new AppError(
      'This page has too little readable text. It may require JavaScript or a sign-in. Try a public article.',
      422,
    );
  return {
    title: title.slice(0, 250),
    source: text.slice(0, MAX_SOURCE_CHARS),
    wordCount: text.split(/\s+/).length,
    sourceTruncated: text.length > MAX_SOURCE_CHARS,
    excerpt: text.slice(0, 180),
  };
}
export async function fetchWebpage(input: string, signal: AbortSignal) {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
  let url = normalizeUrl(input);
  for (let hops = 0; hops < 5; hops++) {
    await validateDNS(url, timeout);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: timeout,
        headers: {
          'User-Agent': 'URLWorkspace/1.0 (webpage summarizer)',
          Accept: 'text/html,text/plain',
        },
      });
    } catch (error) {
      if (timeout.aborted) throw error;
      throw new AppError(
        'This website could not be reached. Check the URL or try another page.',
        422,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) break;
      url = normalizeUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        `The website returned HTTP ${response.status}. It may be unavailable or blocking access.`,
        422,
      );
    }
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) {
      await response.body?.cancel();
      throw new AppError(
        'This link is not a readable webpage. Try an HTML article or plain-text page.',
        422,
      );
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw new AppError(
        'This page is too large to summarize (2 MB limit).',
        422,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new AppError('The website returned an empty page.', 422);
    let html = '',
      bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES)
          throw new AppError(
            'This page is too large to summarize (2 MB limit).',
            422,
          );
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return { ...extractPage(html, url.href, type), url: url.href };
  }
  throw new AppError(
    'This website redirected too many times. Try its final URL.',
    422,
  );
}
