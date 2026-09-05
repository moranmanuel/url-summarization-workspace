import { owner, jsonBody, responseHeaders } from '@/lib/server/http';
import { errorResponse } from '@/lib/server/errors';
import * as repository from '@/lib/server/repository';
import { normalizeUrl } from '@/lib/server/webpage';
import { requireLLM } from '@/lib/server/llm';
import { streamResponse } from '@/lib/server/stream';
import { summarize } from '@/lib/server/summary';
export async function GET(request: Request) {
  try {
    const { id, cookie } = owner(request);
    const sessions = await repository.list(
      id,
      new URL(request.url).searchParams.get('q') ?? '',
    );
    return Response.json({ sessions }, { headers: responseHeaders(cookie) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const url = normalizeUrl(body.url);
    requireLLM();
    const { id, cookie } = owner(request);
    const row = await repository.create(id, url.href);
    return streamResponse(request, cookie, (send, signal) =>
      summarize(row, row.runId!, send, signal),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
