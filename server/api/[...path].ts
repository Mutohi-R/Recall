// Any /api path that matches no route gets a JSON 404 instead of the page.
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, statusMessage: 'Not found' });
});
