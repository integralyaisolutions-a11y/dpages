import { describe, expect, it } from 'vitest';
import { calcularPesLinia } from './pes.js';

describe('calcularPesLinia', () => {
  it('con peso de ficha: kgDemanats = unidades × pesFitxaKg, no editable', () => {
    const resultado = calcularPesLinia(10, '1.250');
    expect(resultado.pesFitxaKg).toBe('1.250');
    expect(resultado.pesCalculatKg).toBe('12.500');
    expect(resultado.pesEditable).toBe(false);
  });

  it('sin peso de ficha: "a medida", queda en cero y editable', () => {
    const resultado = calcularPesLinia(4, null);
    expect(resultado.pesFitxaKg).toBeNull();
    expect(resultado.pesCalculatKg).toBe('0.000');
    expect(resultado.pesEditable).toBe(true);
  });

  it('redondea a 3 decimales', () => {
    const resultado = calcularPesLinia(3, '0.333');
    expect(resultado.pesCalculatKg).toBe('0.999');
  });
});
