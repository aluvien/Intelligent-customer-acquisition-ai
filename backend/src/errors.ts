export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly expose: boolean;

  constructor(status: number, code: string, message: string, expose = true) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : '服务器内部错误';
  return new AppError(500, 'INTERNAL_ERROR', message, false);
}
