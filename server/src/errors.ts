export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message)
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'Insufficient permissions') => new AppError(403, 'FORBIDDEN', message)
export const conflict = (code: string, message: string) => new AppError(409, code, message)
