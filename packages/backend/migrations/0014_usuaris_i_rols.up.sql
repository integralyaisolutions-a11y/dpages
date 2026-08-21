-- Capa 17: usuarios y roles. Aditiva. Decisión de negocio ya tomada: dos
-- roles, 'Administrador' (todos los módulos, incluida la gestión de
-- usuarios/roles) y 'General' (todos los módulos operativos, sin esa
-- gestión) — el cliente pidió que "todos vean todo" del negocio, pero
-- nadie queda con gestión de usuarios/roles sólo por loguearse primero:
-- eso se otorga a mano, vía PATCH /usuaris/:id, por alguien ya-Administrador
-- (ver resoldre-usuari.ts, que auto-provisiona con 'General', nunca con
-- 'Administrador'). Parametrizable sin desarrollo futuro si algún día
-- quieren más granularidad (PATCH /rols/:id, o crear más roles).

CREATE TABLE rol (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_seq          BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  nom             TEXT NOT NULL UNIQUE,
  moduls_permesos TEXT[] NOT NULL DEFAULT '{}',
  creat_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuari (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_seq         BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  firebase_uid   TEXT NOT NULL UNIQUE,
  nom            TEXT NOT NULL,
  email          TEXT NOT NULL,
  rol_id         UUID NOT NULL REFERENCES rol(id),
  actiu          BOOLEAN NOT NULL DEFAULT true,
  creat_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usuari_firebase_uid ON usuari(firebase_uid);

-- Seed EN la migración, no en seed-arranque.ts: a diferencia de las
-- categorías/orígenes de pedido (datos de negocio reemplazables por lo que
-- traiga el cliente en el cut-over), este rol es la configuración
-- estructural permanente del sistema, y además hay una dependencia dura de
-- disponibilidad — el auto-provisioning de usuari corre en el primer login
-- de CUALQUIER persona contra CUALQUIER ambiente recién migrado (no hay
-- garantía de que alguien haya corrido seed-arranque.ts antes de que
-- alguien inicie sesión). Sin esta fila, el primer login del sistema
-- fallaría por violar la FK NOT NULL de usuari.rol_id.
INSERT INTO rol (nom, moduls_permesos) VALUES
  ('Administrador', ARRAY['categories','catalog','tarifes',
    'tarifes-clients','comandes','rendiments-porcs','panell-oficina',
    'panell-obrador','panell-empaquetat','panell-produccio','usuaris',
    'rols']),
  ('General', ARRAY['categories','catalog','tarifes','tarifes-clients',
    'comandes','rendiments-porcs','panell-oficina','panell-obrador',
    'panell-empaquetat','panell-produccio']);
