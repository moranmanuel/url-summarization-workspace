import { configuration } from '@/lib/server/llm';
export function GET() {
  return Response.json(configuration(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
