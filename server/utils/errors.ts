import { ValidationError } from '../../lib/validation';
import { NotFoundError } from '../../lib/persistence/content';
import {
  InvalidReviewError,
  NotDueError,
} from '../../lib/services/submit-review';
import {
  ItemNotFoundError,
  ReviewConflictError,
} from '../../lib/persistence/store';

// Turns the errors the lower layers throw into HTTP responses. Anything
// unrecognised becomes a plain 500: database messages are not sent to the
// browser.
export function toHttpError(e: unknown) {
    if (e && typeof e === 'object' && 'statusCode' in e) {
      // already an h3 error; log the server-side ones so they are not silent
      if ((e as { statusCode: number }).statusCode >= 500) console.error(e);
      return e;
    }
  if (e instanceof ValidationError || e instanceof InvalidReviewError) {
    return createError({ statusCode: 400, statusMessage: (e as Error).message });
  }
  if (e instanceof NotFoundError || e instanceof ItemNotFoundError) {
    return createError({ statusCode: 404, statusMessage: 'Not found' });
  }
  if (e instanceof NotDueError) {
    return createError({ statusCode: 409, statusMessage: 'Item is not due for review' });
  }
  if (e instanceof ReviewConflictError) {
    return createError({ statusCode: 409, statusMessage: 'Please try again' });
  }
  console.error(e);
  return createError({ statusCode: 500, statusMessage: 'Something went wrong' });
}
