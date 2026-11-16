const TITLES = new Set([
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

export function mentions(query: string): string[] {
  const words = query.match(/\p{L}+/gu) ?? [];
  const picked: string[] = [];
  words.forEach((word, index) => {
    if (word.length < 3 || !startsWithCapital(word)) return;
    if (TITLES.has(fold(word))) return;
    if (index === 0 && words.length > 2) return;
    picked.push(word);
  });
  if (picked.length === 0) {
    for (const word of words) {
      if (word.length < 3 || !looksLikeNickname(word)) continue;
      picked.push(word);
    }
  }
  return [...new Set(picked)].slice(0, 3);
}

const FILLER = new Set([
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

const VERBS = new Set([
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

export function leadingNames(query: string): string[] {
  const words = query.match(/\p{L}+/gu) ?? [];
  const first = words[0];
  const second = words[1];
  if (!first || first.length < 3 || !second || !startsWithCapital(first)) return [];
  const head = fold(first);
  if (FILLER.has(head) || TITLES.has(head) || VERBS.has(head)) return [];
  if (second.length < 3 || FILLER.has(fold(second)) || TITLES.has(fold(second))) return [];
  const verbFollows = words.slice(2).some((word) => VERBS.has(fold(word)));
  if (!startsWithCapital(second) && !verbFollows) return [];
  return [first, second];
}

export function coverOutlets<T extends { id: string; url: string | null }>(
  ranked: T[],
  proof: T[],
  outletOf: (url: string | null) => string | null,
  cap = 8,
): T[] {
  const covered = new Set<string>();
  for (const item of ranked) {
    const outlet = outletOf(item.url);
    if (outlet) covered.add(outlet);
  }
  const extra: T[] = [];
  const seen = new Set(ranked.map((item) => item.id));
  for (const item of proof) {
    const outlet = outletOf(item.url);
    if (!outlet || covered.has(outlet) || seen.has(item.id)) continue;
    covered.add(outlet);
    seen.add(item.id);
    extra.push(item);
  }
  const room = Math.max(0, cap - extra.length);
  return [...ranked.slice(0, room), ...extra];
}

export function evidenceFits(
  claims: string[],
  item: { origin: string; title: string; snippet: string },
  names: string[],
): boolean {
  if (item.origin !== "tavily") return true;
  const text = fold(`${item.title} ${item.snippet}`);
  const claim = fold(claims.join(" "));
  if (
    /penal|antecedente|proceso|sentencia|condena|delito|viol/.test(claim) &&
    /denuncia|expediente|proceso penal|sentencia|condena/.test(text)
  ) {
    return true;
  }
  if (/promet|ofrec|propuesta|plan/.test(claim) && /propuso|propuesta|ofrec|declar/.test(text)) {
    return true;
  }
  const skipped = new Set(
    names.flatMap((name) => fold(name).split(/\s+/)).filter((word) => word.length > 2),
  );
  const tokens = (claims.join(" ").match(/\p{L}+/gu) ?? [])
    .map(fold)
    .filter((word) => word.length >= 5 && !FILLER.has(word) && !skipped.has(word));
  if (tokens.length === 0) return false;
  return tokens.some((token) => text.includes(token));
}

export function bestMatch<T extends { id: string; nombre: string }>(
  hits: Array<{ entity: T; tokens: string[] }>,
): T[] {
  const score = new Map<string, { entity: T; points: number }>();
  for (const hit of hits) {
    const folded = fold(hit.entity.nombre);
    const points = hit.tokens.filter((token) => folded.includes(fold(token))).length;
    const current = score.get(hit.entity.id);
    if (!current || points > current.points) score.set(hit.entity.id, { entity: hit.entity, points });
  }
  const max = Math.max(0, ...[...score.values()].map((item) => item.points));
  if (max === 0) return [];
  return [...score.values()].filter((item) => item.points === max).map((item) => item.entity);
}

export function namesInText(text: string, alias: string[]): string[] {
  const skipped = new Set(alias.map(fold));
  const matches = text.match(/\p{Lu}[\p{L}'’]+(?:\s+\p{Lu}[\p{L}'’]+){1,2}/gu) ?? [];
  const names: string[] = [];
  for (const match of matches) {
    const parts = match.split(/\s+/).filter((part) => !TITLES.has(fold(part)));
    if (parts.length < 2) continue;
    if (parts.every((part) => skipped.has(fold(part)))) continue;
    const name = parts.join(" ");
    if (!names.includes(name)) names.push(name);
  }
  return names.slice(0, 6);
}

const WORDS_ENDING_IN_Y = new Set(["hay", "muy", "hoy", "soy", "voy", "doy", "ley", "rey", "buey", "estoy", "cuy"]);

function looksLikeNickname(word: string): boolean {
  const folded = fold(word);
  if (WORDS_ENDING_IN_Y.has(folded)) return false;
  if (/[kw]/.test(folded)) return true;
  return folded.length >= 4 && folded.endsWith("y");
}

function startsWithCapital(word: string): boolean {
  const first = word.charAt(0);
  return first === first.toLocaleUpperCase("es") && first !== first.toLocaleLowerCase("es");
}

function fold(word: string): string {
  return word
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
