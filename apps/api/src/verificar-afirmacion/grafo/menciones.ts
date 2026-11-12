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
