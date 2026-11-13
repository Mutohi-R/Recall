import type { EventHandlerRequest, H3Event } from 'h3';

type Handler = (event: H3Event<EventHandlerRequest>) => unknown;
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// Defines one API route and the methods it offers. Any other method gets a
// 405. DELETE is offered only on decks and cards, and there it archives the
// row instead of removing it, so the study records built on it are kept (3.8).
// Errors from the lower layers become the right HTTP status.
export function defineApiRoute(handlers: Partial<Record<Method, Handler>>) {
  return defineEventHandler(async (event) => {
    const handler = handlers[event.method as Method];
    if (!handler) {
      setResponseHeader(event, 'Allow', Object.keys(handlers).join(', '));
      throw createError({ statusCode: 405, statusMessage: 'Method not allowed' });
    }
    try {
      return await handler(event);
    } catch (e) {
      throw toHttpError(e);
    }
  });
}
