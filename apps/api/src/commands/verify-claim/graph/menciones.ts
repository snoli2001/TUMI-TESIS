const TITULOS = new Set([
  "los",
  "las",
  "el",
  "la",
  "don",
  "dona",
  "sr",
  "sra",
  "senor",
  "senora",
]);

export function menciones(query: string): string[] {
  const words = query.match(/\p{L}+/gu) ?? [];
  const picked: string[] = [];
  words.forEach((word, index) => {
    if (word.length < 3 || !empiezaEnMayuscula(word)) return;
    if (TITULOS.has(plegar(word))) return;
    if (index === 0 && words.length > 2) return;
    picked.push(word);
  });
  if (picked.length === 0) {
    for (const word of words) {
      if (word.length < 3 || !pareceApodo(word)) continue;
      picked.push(word);
    }
  }
  return [...new Set(picked)].slice(0, 3);
}

const RELLENO = new Set([
  "que",
  "del",
  "los",
  "las",
  "una",
  "uno",
  "por",
  "con",
  "para",
  "como",
  "esta",
  "este",
  "eso",
  "esa",
  "sus",
  "son",
  "ser",
  "hay",
  "mas",
  "the",
  "sobre",
  "entre",
  "desde",
  "hasta",
]);

const VERBO = new Set([
  "es",
  "son",
  "era",
  "eran",
  "fue",
  "fueron",
  "esta",
  "estan",
  "estaba",
  "estaban",
  "estuvo",
  "sera",
  "seria",
  "tiene",
  "tienen",
  "tenia",
  "tuvo",
  "tuvieron",
  "ha",
  "han",
  "hay",
  "habia",
  "puede",
  "pueden",
  "podria",
  "debe",
  "deben",
  "dice",
  "dicen",
  "dijo",
  "afirma",
  "afirman",
  "niega",
  "niegan",
  "miente",
  "mienten",
  "postula",
  "postulan",
  "promete",
  "prometio",
  "ofrece",
  "ofrecio",
  "quiere",
  "quieren",
  "va",
  "van",
  "cometio",
  "comete",
  "registra",
  "figura",
  "aparece",
  "resulta",
  "acusa",
  "acusan",
  "roba",
  "robo",
  "hace",
  "hizo",
]);

export function nombresAlInicio(query: string): string[] {
  const words = query.match(/\p{L}+/gu) ?? [];
  const primero = words[0];
  const segundo = words[1];
  if (!primero || primero.length < 3 || !segundo || !empiezaEnMayuscula(primero)) return [];
  const cabeza = plegar(primero);
  if (RELLENO.has(cabeza) || TITULOS.has(cabeza) || VERBO.has(cabeza)) return [];
  if (segundo.length < 3 || RELLENO.has(plegar(segundo)) || TITULOS.has(plegar(segundo))) return [];
  const sigueUnVerbo = words.slice(2).some((word) => VERBO.has(plegar(word)));
  if (!empiezaEnMayuscula(segundo) && !sigueUnVerbo) return [];
  return [primero, segundo];
}

export function pruebaSirve(
  claims: string[],
  item: { origin: string; title: string; snippet: string },
  nombres: string[],
): boolean {
  if (item.origin !== "tavily") return true;
  const omitidos = new Set(
    nombres.flatMap((nombre) => plegar(nombre).split(/\s+/)).filter((word) => word.length > 2),
  );
  const text = plegar(`${item.title} ${item.snippet}`);
  const tokens = (claims.join(" ").match(/\p{L}+/gu) ?? [])
    .map(plegar)
    .filter((word) => word.length >= 5 && !RELLENO.has(word) && !omitidos.has(word));
  if (tokens.length === 0) return false;
  return tokens.some((token) => text.includes(token));
}

export function mejorCoincidencia<T extends { id: string; nombre: string }>(
  hits: Array<{ entity: T; tokens: string[] }>,
): T[] {
  const score = new Map<string, { entity: T; points: number }>();
  for (const hit of hits) {
    const folded = plegar(hit.entity.nombre);
    const points = hit.tokens.filter((token) => folded.includes(plegar(token))).length;
    const current = score.get(hit.entity.id);
    if (!current || points > current.points) score.set(hit.entity.id, { entity: hit.entity, points });
  }
  const max = Math.max(0, ...[...score.values()].map((item) => item.points));
  if (max === 0) return [];
  return [...score.values()].filter((item) => item.points === max).map((item) => item.entity);
}

export function nombresEnTexto(text: string, alias: string[]): string[] {
  const omitidos = new Set(alias.map(plegar));
  const matches = text.match(/\p{Lu}[\p{L}'’]+(?:\s+\p{Lu}[\p{L}'’]+){1,2}/gu) ?? [];
  const names: string[] = [];
  for (const match of matches) {
    const parts = match.split(/\s+/).filter((part) => !TITULOS.has(plegar(part)));
    if (parts.length < 2) continue;
    if (parts.every((part) => omitidos.has(plegar(part)))) continue;
    const name = parts.join(" ");
    if (!names.includes(name)) names.push(name);
  }
  return names.slice(0, 6);
}

const PALABRAS_CON_Y = new Set(["hay", "muy", "hoy", "soy", "voy", "doy", "ley", "rey", "buey", "estoy", "cuy"]);

function pareceApodo(word: string): boolean {
  const folded = plegar(word);
  if (PALABRAS_CON_Y.has(folded)) return false;
  if (/[kw]/.test(folded)) return true;
  return folded.length >= 4 && folded.endsWith("y");
}

function empiezaEnMayuscula(word: string): boolean {
  const first = word.charAt(0);
  return first === first.toLocaleUpperCase("es") && first !== first.toLocaleLowerCase("es");
}

function plegar(word: string): string {
  return word
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
