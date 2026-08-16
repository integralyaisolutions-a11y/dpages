import type { LliuramentRespostaApi } from '@dpages/shared';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../../db/pool.js';
import {
  enviarConflicte,
  enviarNoTrobat,
  enviarValidacio,
  formatearDataApi,
  parsearIdPublic,
} from './comu.js';

/**
 * Firebase Auth llega en una capa posterior (el usuario lo pidió
 * explícitamente para esta capa: "dejá el modo desarrollo sin token").
 * Mientras tanto no hay ningún operario real identificable — este valor
 * fijo deja rastro de que la confirmación pasó por acá, sin inventar una
 * identidad. `confirmat_per` en la base guarda un marcador simple, no un
 * uid real, hasta que exista autenticación de verdad.
 */
const OPERARI_SENSE_AUTH = 'dev-sense-auth';
const OPERARI_SENSE_AUTH_NOM = 'Desenvolupament (sense autenticació)';

/**
 * El endpoint más delicado del sistema (contrato, sección 5): unitats i kg
 * lliurats son OBLIGATORIOS y nunca pueden quedar en cero, aunque
 * coincidan con lo pedido — es doble confirmación deliberada (mermas →
 * abono/cargo). Una sola llamada confirma Y graba; no hay un paso previo
 * de "guardar sin confirmar".
 */
export function registrarRutaLliurament(fastify: FastifyInstance): void {
  fastify.patch('/comandes/:comandaId/linies/:liniaId/lliurament', async (req, reply) => {
    const params = req.params as { comandaId: string; liniaId: string };
    const comandaIdPublic = parsearIdPublic(params.comandaId);
    const liniaIdPublic = parsearIdPublic(params.liniaId);
    if (comandaIdPublic === null || liniaIdPublic === null) {
      return enviarNoTrobat(reply, 'Línia no trobada');
    }

    const cos = req.body as Partial<{ unitatsLliurades: number; kgLliurats: string }>;
    const detalls: { camp: string; missatge: string }[] = [];

    if (
      cos.unitatsLliurades === undefined ||
      !Number.isInteger(cos.unitatsLliurades) ||
      cos.unitatsLliurades <= 0
    ) {
      detalls.push({ camp: 'unitatsLliurades', missatge: 'ha de ser més gran que zero' });
    }
    const kgLliurats = cos.kgLliurats !== undefined ? Number(cos.kgLliurats) : NaN;
    if (cos.kgLliurats === undefined || !Number.isFinite(kgLliurats) || kgLliurats <= 0) {
      detalls.push({ camp: 'kgLliurats', missatge: 'ha de ser més gran que zero' });
    }
    if (detalls.length > 0) {
      return enviarValidacio(reply, 'Les unitats i els kg lliurats no poden ser zero', detalls);
    }

    const comanda = await pool.query<{ id: string; congelat_a: Date | null }>(
      'SELECT id, congelat_a FROM comanda WHERE id_seq = $1',
      [comandaIdPublic],
    );
    if (!comanda.rows[0]) return enviarNoTrobat(reply, 'Comanda no trobada');
    if (comanda.rows[0].congelat_a !== null) {
      return enviarConflicte(reply, 'La comanda està congelada i ja no admet canvis');
    }

    const resultat = await pool.query<{ id_seq: string; confirmat_a: Date }>(
      `UPDATE comanda_linia SET
         unitats_lliurades = $3,
         kg_lliurats = $4,
         confirmat_a = now(),
         confirmat_per = $5
       WHERE id_seq = $1 AND comanda_id = $2
       RETURNING id_seq, confirmat_a`,
      [liniaIdPublic, comanda.rows[0].id, cos.unitatsLliurades, cos.kgLliurats, OPERARI_SENSE_AUTH],
    );
    if (!resultat.rows[0]) return enviarNoTrobat(reply, 'Línia no trobada');

    const resposta: LliuramentRespostaApi = {
      liniaId: Number(resultat.rows[0].id_seq),
      comandaId: comandaIdPublic,
      unitatsLliurades: cos.unitatsLliurades!,
      kgLliurats: cos.kgLliurats!,
      confirmatA: formatearDataApi(resultat.rows[0].confirmat_a)!,
      confirmatPer: { id: 0, nom: OPERARI_SENSE_AUTH_NOM },
    };
    return resposta;
  });
}
