import { AppError } from './errors';
const COOKIE = 'url_workspace';
export function owner(request: Request): { id: string; cookie?: string } {
  const existing = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return { id: existing };
  const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    id,
    cookie: `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
  };
}
export function responseHeaders(cookie?: string): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return headers;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new AppError('Cross-origin requests are not allowed.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new AppError('Cross-origin requests are not allowed.', 403);
}
export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  checkOrigin(request);
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('Send a JSON request.', 415);
  if (Number(request.headers.get('content-length')) > 20000)
    throw new AppError('The request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('A request body is required.');
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20000) {
        await reader.cancel();
        throw new AppError('The request is too large.', 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError('Expected a JSON object.');
  return body as Record<string, unknown>;
}
