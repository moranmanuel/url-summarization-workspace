import { owner, checkOrigin } from '@/lib/server/http';
import { AppError, errorResponse } from '@/lib/server/errors';
import * as repository from '@/lib/server/repository';
import { requireLLM } from '@/lib/server/llm';
import { streamResponse } from '@/lib/server/stream';
import { summarize } from '@/lib/server/summary';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    requireLLM();
    const { id } = await context.params;
    const identity = owner(request);
    await repository.recover(identity.id);
    const row = await repository.get(identity.id, id);
    if (row.status !== 'error')
      throw new AppError('Only an interrupted summary needs a retry.', 409);
    const runId = await repository.acquire(row);
    return streamResponse(request, identity.cookie, (send, signal) =>
      summarize(row, runId, send, signal),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
