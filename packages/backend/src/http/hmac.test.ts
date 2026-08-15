import { describe, expect, it } from 'vitest';
import { calcularFirmaWebhook, firmaValida } from './hmac.js';

const secret = 'un-secreto-de-prueba';
const cuerpo = Buffer.from('{"id":90001,"status":"completed"}', 'utf8');

describe('firmaValida', () => {
  it('acepta la firma correcta calculada sobre el mismo cuerpo crudo', () => {
    const firma = calcularFirmaWebhook(cuerpo, secret);
    expect(firmaValida(cuerpo, firma, secret)).toBe(true);
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const firma = calcularFirmaWebhook(cuerpo, 'otro-secreto');
    expect(firmaValida(cuerpo, firma, secret)).toBe(false);
  });

  it('rechaza si el cuerpo cambió después de firmarlo (ej. el parser lo reserializó)', () => {
    const firma = calcularFirmaWebhook(cuerpo, secret);
    const cuerpoAlterado = Buffer.from('{"id":90001,"status":"cancelled"}', 'utf8');
    expect(firmaValida(cuerpoAlterado, firma, secret)).toBe(false);
  });

  it('rechaza si falta la firma', () => {
    expect(firmaValida(cuerpo, undefined, secret)).toBe(false);
  });

  it('rechaza una firma vacía', () => {
    expect(firmaValida(cuerpo, '', secret)).toBe(false);
  });

  it('rechaza una firma de longitud distinta sin lanzar (timingSafeEqual exige igual longitud)', () => {
    expect(firmaValida(cuerpo, 'corta', secret)).toBe(false);
  });

  it('rechaza una firma con la misma longitud pero contenido distinto', () => {
    const firma = calcularFirmaWebhook(cuerpo, secret);
    const alterada = firma.slice(0, -1) + (firma.endsWith('A') ? 'B' : 'A');
    expect(firmaValida(cuerpo, alterada, secret)).toBe(false);
  });
});
