export interface PesLinia {
  /** Peso de ficha del artículo en el momento de calcular. Null si es "a medida" o no se resolvió. */
  pesFitxaKg: string | null;
  /** unitats × pesFitxaKg, con 3 decimales. 0 cuando es "a medida" — estado válido, a la espera de que alguien lo complete. */
  pesCalculatKg: string;
  /** true = el artículo no tiene peso de ficha (o no se resolvió): el campo de la línea queda editable a mano. */
  pesEditable: boolean;
}

/**
 * kgDemanats = unidades × peso de ficha del artículo. Si el artículo no
 * tiene peso (o no se resolvió ninguno), la línea es "a medida": el peso
 * queda en 0 y editable, nunca se inventa un valor.
 */
export function calcularPesLinia(unitatsDemanades: number, pesFitxaKg: string | null): PesLinia {
  if (pesFitxaKg === null) {
    return { pesFitxaKg: null, pesCalculatKg: '0.000', pesEditable: true };
  }

  const calculat = unitatsDemanades * Number(pesFitxaKg);
  return {
    pesFitxaKg,
    pesCalculatKg: calculat.toFixed(3),
    pesEditable: false,
  };
}
