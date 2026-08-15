import pino from 'pino';
import { env } from '../config/env.js';

/**
 * JSON estructurado directo a stdout — Cloud Logging lo entiende sin
 * transports ni escritura a archivo (Cloud Run no tiene disco persistente).
 *
 * `redact` es una red de seguridad además de la disciplina de no loggear
 * datos personales: si alguna vez se vuelca por error un objeto con estas
 * claves (nombre, NIF, dirección, cabecera de autenticación...), Pino lo
 * censura en vez de escribirlo tal cual.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      '*.email',
      '*.correu',
      '*.telefon',
      '*.telefono',
      '*.nif',
      '*.dni',
      '*.adreca',
      '*.direccion',
      '*.billing',
      '*.shipping',
    ],
    censor: '[redactat]',
  },
});
