export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
    return 'The request was interrupted or took too long. Any partial text has been saved. Please retry.';
  if (error instanceof Error && error.message)
    return `The request failed: ${error.message}`;
  return 'Something went wrong. Please try again.';
}
export function errorResponse(error: unknown) {
  return Response.json(
    { error: errorMessage(error) },
    { status: error instanceof AppError ? error.status : 500 },
  );
}
