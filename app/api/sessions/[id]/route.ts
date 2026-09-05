import { owner, responseHeaders, checkOrigin } from '@/lib/server/http';
import { errorResponse } from '@/lib/server/errors';
import * as repository from '@/lib/server/repository';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const identity = owner(request);
    await repository.recover(identity.id);
    const row = await repository.get(identity.id, id);
    return Response.json(
      {
        ...repository.publicSession(row),
        messages: await repository.getMessages(id),
      },
      { headers: responseHeaders(identity.cookie) },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { id } = await context.params;
    await repository.remove(owner(request).id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
