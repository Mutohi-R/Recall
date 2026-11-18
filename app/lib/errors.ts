export interface ErrorPageContent {
  digits: [string, string, string];
  title: string;
  body: string;
}

export function errorPageContent(statusCode: number | undefined): ErrorPageContent {
  if (statusCode === 404) {
    return {
      digits: ['4', '0', '4'],
      title: 'We could not find that page',
      body: 'The link may be wrong, or the deck was deleted.',
    };
  }
  const code = /^\d{3}$/.test(String(statusCode)) ? String(statusCode) : '500';
  return {
    digits: [code[0]!, code[1]!, code[2]!],
    title: 'Something went wrong',
    body: 'Recall ran into a problem. Go back to your decks and try again.',
  };
}
