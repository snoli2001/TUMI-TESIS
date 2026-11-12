import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const penal = await client.query(`
  SELECT 'penal' AS tipo, materia, fallo, expediente, fecha_sentencia
  FROM tumi.resume_criminal
  WHERE hoja_vida_id = '1b4pvxyc6zJcQNGQp5doIM1eX158DFP0'
  UNION ALL
  SELECT 'obligacion', materia, fallo, expediente, fecha_sentencia
  FROM tumi.resume_obligation
  WHERE hoja_vida_id = '1b4pvxyc6zJcQNGQp5doIM1eX158DFP0'
`);
console.log("SENTENCIAS", JSON.stringify(penal.rows, null, 2));
const turnos = await client.query(`
  SELECT id, created_at, content, verdict, sources->'query' AS query
  FROM tumi.fact_turns
  WHERE content ILIKE '%investig%' OR sources::text ILIKE '%investig%'
  ORDER BY id DESC
  LIMIT 3
`);
console.log("TURNOS", turnos.rows.map((row) => ({
  id: row.id?.toString?.() ?? row.id,
  created_at: row.created_at,
  verdict: row.verdict,
  query: row.query,
  content: String(row.content ?? "").slice(0, 400),
})));
await client.end();
