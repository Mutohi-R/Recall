export class ApiError extends Error {
  constructor(
    readonly status: number,
    message = '',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchErrorLike {
  statusCode?: number;
  status?: number;
  statusMessage?: string;
  message?: string;
  data?: { message?: string; statusMessage?: string } | null;
  response?: { status?: number };
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const err = (e ?? {}) as FetchErrorLike;
  const status = err.statusCode ?? err.status ?? err.response?.status ?? 0;
  const text =
    err.data?.message ?? err.data?.statusMessage ?? err.statusMessage ?? '';
  return new ApiError(status, text);
}

export function apiErrorMessage(e: unknown): string {
  const error = toApiError(e);
  if (error.status === 0)
    return 'Could not reach the server. Check your connection and try again.';
  if (error.status === 400)
    return error.message || 'That could not be saved. Check it and try again.';
  if (error.status === 401)
    return 'Your session has expired. Sign in again to continue.';
  if (error.status === 404)
    return 'That could not be found. It may have been deleted.';
  if (error.status === 409)
    return 'Something changed while you were working. Try again.';
  if (error.status >= 500)
    return 'Something went wrong on our side. Try again in a moment.';
  return 'Something went wrong. Try again in a moment.';
}
