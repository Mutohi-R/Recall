import type { EventHandlerRequest, H3Event } from 'h3';

type Handler = (event: H3Event<EventHandlerRequest>) => unknown;
type Method = 'GET' | 'POST' | 'PATCH';

// Defines one API route and the methods it offers. Any other method gets a
// 405, so for example DELETE on a deck is refused outright: the application
// provides no self-service deletion of study records (3.8). Errors from the
// lower layers become the right HTTP status.
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
