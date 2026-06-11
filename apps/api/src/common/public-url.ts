/** URL pública do front (links enviados por WhatsApp). */
export function publicWebUrl(): string {
  return (
    process.env.PUBLIC_WEB_URL ??
    process.env.WEB_ORIGIN?.split(',')[0] ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}
