import { describe, expect, it } from 'vitest';
import { ESTATS_COMANDA } from '@dpages/shared';

describe('andamiaje inicial', () => {
  it('resuelve @dpages/shared como paquete compilado (ADR-010)', () => {
    expect(ESTATS_COMANDA).toContain('oberta');
  });
});
