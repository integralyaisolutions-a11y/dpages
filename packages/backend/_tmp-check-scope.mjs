import pg from "pg";

const pool = new pg.Pool({ connectionString: "postgres://dpages:dpages@localhost:5433/dpages" });

const tables = ["producte", "tarifa", "tarifa_preu", "client", "comanda", "comanda_linia", "incidencia_comanda", "alias_producte", "rendiments_porcs", "categoria_producte", "transportista", "origen_comanda"];
for (const t of tables) {
  const r = await pool.query(`SELECT count(*) FROM ${t}`);
  console.log(`${t}: ${r.rows[0].count}`);
}

const comandes = await pool.query(`SELECT id_seq, origen_id, woo_order_id, estat FROM comanda LIMIT 20`);
console.log("Mostra de comanda:", JSON.stringify(comandes.rows));

const clients = await pool.query(`SELECT id_seq, codi, nom FROM client LIMIT 20`);
console.log("Mostra de client:", JSON.stringify(clients.rows));

await pool.end();
