import type { Message } from '@/lib/types';
import { owner, jsonBody } from '@/lib/server/http';
import { AppError, errorMessage, errorResponse } from '@/lib/server/errors';
import * as repository from '@/lib/server/repository';
import { generate, requireLLM, CHAT_SYSTEM, type Turn } from '@/lib/server/llm';
import { streamResponse } from '@/lib/server/stream';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = await jsonBody(request);
    if (
      typeof body.content !== 'string' ||
      !body.content.trim() ||
      body.content.length > 6000
    )
      throw new AppError('Enter a question of up to 6,000 characters.');
    requireLLM();
    const { id } = await context.params;
    const identity = owner(request);
    await repository.recover(identity.id);
    const row = await repository.get(identity.id, id);
    if (
      !row.source ||
      !row.summary ||
      row.status === 'fetching' ||
      row.status === 'streaming'
    )
      throw new AppError(
        'Wait until the summary is ready before asking a question.',
        409,
      );
    const runId = await repository.acquire(row);
    let history: Message[];
    const now = Date.now();
    const user: Message = {
      id: crypto.randomUUID(),
      sessionId: id,
      role: 'user',
      content: body.content.trim(),
      status: 'complete',
      error: null,
      createdAt: now,
    };
    const assistant: Message = {
      id: crypto.randomUUID(),
      sessionId: id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      error: null,
      createdAt: now + 1,
    };
    try {
      history = await repository.getMessages(id);
      await repository.insertMessages(user, assistant);
    } catch (error) {
      await repository.release(row, runId);
      throw error;
    }
    return streamResponse(request, identity.cookie, async (send, signal) => {
      send({ type: 'message', message: user });
      send({ type: 'message', message: assistant });
      try {
        // Only complete exchanges are sent back to the provider, bounded to the most recent 10.
        const completeTurns: Turn[] = [];
        for (let i = 0; i < history.length - 1; i++) {
          const question = history[i],
            answer = history[i + 1];
          if (
            question.role === 'user' &&
            answer.role === 'assistant' &&
            answer.status === 'complete'
          ) {
            completeTurns.push(
              { role: 'user', parts: [{ text: question.content }] },
              { role: 'model', parts: [{ text: answer.content }] },
            );
          }
        }
        const turns = completeTurns.slice(-20);
        turns.push({ role: 'user', parts: [{ text: user.content }] });
        let checkpoint = Date.now();
        for await (const text of generate(
          `${CHAT_SYSTEM}\n\nWebpage: ${row.url}\nTitle: ${row.title}\nSOURCE:\n${row.source}\n\nSAVED SUMMARY:\n${row.summary}`,
          turns,
          signal,
        )) {
          assistant.content += text;
          send({ type: 'delta', text });
          if (Date.now() - checkpoint > 800) {
            await repository.saveMessage(assistant);
            checkpoint = Date.now();
          }
        }
        assistant.status = 'complete';
        await repository.saveMessage(assistant);
        send({ type: 'done', message: assistant });
      } catch (error) {
        assistant.status = 'error';
        assistant.error = errorMessage(error);
        await repository.saveMessage(assistant);
        send({
          type: 'error',
          message: assistant.error,
          chatMessage: assistant,
        });
      } finally {
        await repository.release(row, runId);
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
