import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 en base64 sobre el cuerpo CRUDO — nunca sobre el JSON reserializado. */
export function calcularFirmaWebhook(cosBrut: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(cosBrut).digest('base64');
}

/**
 * Comparación en tiempo constante — nunca `===` con secretos. Si las
 * longitudes difieren no hay nada que comparar de forma sensible (la firma
 * esperada siempre mide lo mismo: base64 de un digest de 32 bytes), así que
 * cortar ahí no filtra información útil sobre el secreto.
 */
export function firmaValida(
  cosBrut: Buffer,
  firmaRebuda: string | undefined,
  secret: string,
): boolean {
  if (firmaRebuda === undefined || firmaRebuda === '') return false;

  const esperada = Buffer.from(calcularFirmaWebhook(cosBrut, secret), 'utf8');
  const rebuda = Buffer.from(firmaRebuda, 'utf8');
  if (esperada.length !== rebuda.length) return false;

  return timingSafeEqual(esperada, rebuda);
}
