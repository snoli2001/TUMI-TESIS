import { leadingNames, mentions } from "../graph/mentions";

export interface OfficialProfile {
  id: string;
  name: string;
  shortName: string;
  office: string;
  party: string;
  fotoUrl: string | null;
  codigoExpediente: string | null;
  proposals: Array<{ text: string }>;
  sentences: Array<{ text: string }>;
  record: Array<{ kind: "elected" | "work" | "study"; text: string }>;
}

export interface RuleSource {
  title: string;
  snippet: string;
  origin: "jne" | "qdrant";
}

export type ProfileRule =
  | { kind: "outside"; message: string }
  | {
      kind: "verdict";
      verdict: "verdadero" | "falso";
      confidence: number;
      explanation: string;
      source: RuleSource;
    };

export type QuestionKind = "criminal" | "proposal" | "other";

const CRIME_WORDS = [
  "violador",
  "violacion",
  "viola",
  "condenado",
  "condena",
  "delito",
  "sentencia",
  "homicidio",
  "asesinato",
  "robo",
  "estafa",
  "corrupcion",
  "narcotrafico",
  "peculado",
  "colusion",
  "lavado",
];

const PRIOR_OFFICES = [
  "congresista",
  "parlamentario",
  "diputado",
  "senador",
  "exalcalde",
  "exregidor",
  "exgobernador",
  "ministro",
];

const OFFICES = [
  "alcalde distrital",
  "alcalde provincial",
  "gobernador regional",
  "gobernador",
  "alcalde",
  "regidor",
  "consejero",
  "presidente",
];

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
  "sobre",
  "entre",
  "desde",
  "hasta",
  "el",
  "la",
  "don",
  "dona",
]);

export function asksOtherOffice(query: string, office: string): boolean {
  const claimed = claimedOffice(query);
  return claimed !== null && !fold(office).includes(claimed);
}

export function isValueJudgment(query: string): boolean {
  return /\bmejor\b|\bpeor\b|potencia mundial/.test(fold(query));
}

export function isSingleSentence(query: string): boolean {
  const text = query.trim();
  if (!text) return false;
  const breaks = text.match(/[.!?](?=\s+\p{Lu}|\s*$)/gu) ?? [];
  return breaks.length <= 1;
}

export function claimsToJudge(query: string, extracted: string[]): string[] {
  const sentence = query.trim();
  if (sentence && isSingleSentence(sentence)) return [sentence];
  const parts = extracted.map((item) => item.trim()).filter((item) => item.length > 0);
  return parts.length > 0 ? parts : [sentence];
}

export function contextQueries(name: string, query: string): string[] {
  const folded = fold(query);
  const who = name.trim();
  const queries: string[] = [];
  const deniesMinistry = /nunca/.test(folded) && /\bministro\b|ministerio/.test(folded);
  if (deniesMinistry) queries.push(`${who} fue ministro`);
  if (/\bministro\b|ministerio|renunci/.test(folded)) queries.push(`${who} ministro`);
  if (/renunci/.test(folded)) queries.push(`${who} renuncia`);
  if (/union civil|matrimonio igualitario|proyecto de ley/.test(folded)) queries.push(`${who} unión civil no matrimonial`);
  if (/\bgay\b|homosexual/.test(folded)) queries.push(`${who} declaró que es gay`);
  if (/apoyo policial|trastienda|restaurante/.test(folded)) queries.push(`${who} apoyo policial restaurante`);
  if (deniesMinistry) {
    const lead = `${who} fue ministro`;
    return [lead, ...queries.filter((item) => item !== lead)].slice(0, 2);
  }
  return queries.slice(0, 2);
}

export function officeQueries(name: string, query: string, office: string): string[] {
  if (!asksOtherOffice(query, office)) return [];
  const claimed = claimedOffice(query) ?? "";
  return [`${name} reelección ${claimed}`, `${name} no puede postular a ${claimed} 2026`];
}

function claimedOffice(query: string): string | null {
  const folded = fold(query);
  return OFFICES.find((item) => folded.includes(item)) ?? null;
}

const IDENTIFYING_TITLE =
  /^(?:el|la|los|las)\s+(?:abogad[oa]s?|ingenier[oa]s?|medic[oa]s?|profesor(?:a|es)?|economistas?)\s+/i;

export function contrastTarget(query: string): string {
  const text = query.trim();
  const withoutTitle = text.replace(IDENTIFYING_TITLE, "").trim();
  if (withoutTitle.length < 12 || withoutTitle === text) return text;
  return withoutTitle;
}

export function questionKind(query: string): QuestionKind {
  const folded = fold(query);
  if (CRIME_WORDS.some((word) => folded.includes(word)) || /penal|antecedente|proceso|sentencia|condena|\bdelito\b/.test(folded)) {
    return "criminal";
  }
  if (/promet|ofrec|propuesta|plan de gobierno|se compromet/.test(folded)) return "proposal";
  return "other";
}

export function officialReading(query: string, profile: OfficialProfile): Extract<ProfileRule, { kind: "verdict" }> | null {
  const criminal = criminalReading(query, profile);
  if (criminal) return criminal;
  if (questionKind(query) !== "proposal") return null;
  const rule = decide(query, profile);
  if (rule?.kind === "verdict" && rule.source.title === "Plan de gobierno") return rule;
  return null;
}

export function searchQueries(kind: QuestionKind, name: string, fact: string): string[] {
  const who = name.trim();
  const templates =
    kind === "criminal"
      ? [`${who} denuncia`, `${who} expediente judicial`, `${who} proceso penal`]
      : kind === "proposal"
        ? [`${who} propuesta`, `${who} declaración pública`, `${who} ofreció`]
        : [];
  const all = [...templates, fact].map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length > 0);
  return [...new Set(all)].slice(0, 3);
}

export function sameCandidate(
  title: string,
  snippet: string,
  identity: { name: string; party?: string },
): boolean {
  const name = signals(identity.name);
  if (name.length === 0) return false;
  const text = fold(`${title} ${snippet}`);
  const present = name.filter((token) => text.includes(token));
  if (present.length >= 2) return true;
  if (name.length === 1) return present.length === 1;
  const surnames = name.slice(-2);
  const hasSurname = present.some((token) => surnames.includes(token));
  if (!hasSurname) return false;
  const party = signals(identity.party ?? "").filter((token) => token.length >= 6);
  return party.some((token) => text.includes(token));
}

function signals(value: string): string[] {
  const parts = fold(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !FILLER.has(token));
  return [...new Set(parts)];
}

export function decide(query: string, profile: OfficialProfile): ProfileRule | null {
  if (namesSomeoneElse(query, profile.name, profile.party)) {
    return {
      kind: "outside",
      message: `Esta verificación es solo de ${profile.name}, ${profile.office} por ${profile.party}, en las Elecciones Regionales y Municipales de 2026. El texto nombra a otra persona.`,
    };
  }

  const criminal = criminalReading(query, profile);
  if (criminal) return criminal;

  const folded = fold(query);
  const office = OFFICES.find((item) => folded.includes(item));
  if (office && !fold(profile.office).includes(office)) {
    return {
      kind: "verdict",
      verdict: "falso",
      confidence: 0.95,
      explanation: `${profile.name} postula a ${profile.office} por ${profile.party} en las Elecciones Regionales y Municipales de 2026. El cargo que se afirma no coincide.`,
      source: {
        title: "Padrón",
        snippet: `${profile.name} · ${profile.office} · ${profile.party}`,
        origin: "jne",
      },
    };
  }

  if (/\bpartido\b|\borganizacion\b/.test(folded) && !partyMatches(folded, profile.party)) {
    return {
      kind: "verdict",
      verdict: "falso",
      confidence: 0.95,
      explanation: `${profile.name} postula por ${profile.party}. La organización que se afirma no coincide.`,
      source: {
        title: "Padrón",
        snippet: `${profile.name} · ${profile.party}`,
        origin: "jne",
      },
    };
  }

  if (isValueJudgment(query)) return null;

  if (/promet|promesa|ofrec|plan de gobierno|se compromet/.test(folded)) {
    const hit = profile.proposals.find((item) => matches(query, item.text, profile.name));
    if (!hit) return null;
    return {
      kind: "verdict",
      verdict: "verdadero",
      confidence: 0.85,
      explanation: `El plan de gobierno de la lista de ${profile.name} contiene esa propuesta.`,
      source: {
        title: "Plan de gobierno",
        snippet: hit.text,
        origin: "qdrant",
      },
    };
  }

  const prior = PRIOR_OFFICES.find((word) => new RegExp(`(?:\\b|ex)${word}\\b`).test(folded));
  if (prior === "ministro") return null;
  if (prior) return priorOffice(profile, prior);

  if (/universidad|bachiller|egresad|abogado|ingeniero|medico/.test(folded)) {
    return recordOrFalse(query, profile, "study", "estudios");
  }
  if (/\b(trabajo|gerente|empleo|empresa)\b/.test(folded)) {
    return recordOrFalse(query, profile, "work", "experiencia laboral");
  }

  const row = profile.record.find((item) => matches(query, item.text, profile.name, item.kind));
  if (row) {
    return {
      kind: "verdict",
      verdict: "verdadero",
      confidence: 0.85,
      explanation: `La hoja de vida de ${profile.name} declara ese dato.`,
      source: { title: "Hoja de vida", snippet: row.text, origin: "jne" },
    };
  }

  return null;
}

export function webQuery(shortName: string, query: string, fullName: string): string {
  const fact = factTokens(query, fullName).slice(0, 8).join(" ");
  const year = /postul|candidat|alcald|2026/.test(fold(query)) ? "2026" : "";
  const country = /\bperu\b/.test(fold(query)) ? "Perú" : "";
  return [shortName, fact, country, year].filter(Boolean).join(" ").slice(0, 180);
}

export function claimFocus(query: string, name: string): string {
  const skipped = new Set(fold(name).split(/\s+/).filter((word) => word.length > 2));
  return (query.match(/\p{L}+|\d+/gu) ?? [])
    .filter((word) => !skipped.has(fold(word)))
    .join(" ")
    .slice(0, 180);
}

export function mentionsClaim(title: string, snippet: string, query: string, name: string): boolean {
  const skipped = new Set(fold(name).split(/\s+/).filter((word) => word.length > 2));
  const text = fold(`${title} ${snippet}`);
  const queryFolded = fold(query);
  const tokens = (query.match(/\p{L}+/gu) ?? [])
    .map(fold)
    .filter((word) => word.length >= 5 && !skipped.has(word));
  if (!tokens.some((token) => text.includes(token))) return false;
  if (/\bperu\b/.test(queryFolded) && !/\bperu\b/.test(text)) return false;
  return true;
}

function priorOffice(profile: OfficialProfile, key: string): ProfileRule {
  const root = key.replace(/^ex/, "");
  const hit = profile.record.find((item) => item.kind === "elected" && fold(item.text).includes(root));
  if (hit) {
    return {
      kind: "verdict",
      verdict: "verdadero",
      confidence: 0.9,
      explanation: `La hoja de vida de ${profile.name} declara ese cargo.`,
      source: { title: "Hoja de vida", snippet: hit.text, origin: "jne" },
    };
  }
  const declared = profile.record.filter((item) => item.kind === "elected").map((item) => item.text);
  const detail = declared.length ? `Declara: ${declared.join("; ")}.` : "No declara cargos electos previos.";
  return {
    kind: "verdict",
    verdict: "falso",
    confidence: 0.9,
    explanation: `La hoja de vida de ${profile.name} no declara ese cargo. ${detail} El veredicto es falso.`,
    source: {
      title: "Hoja de vida",
      snippet: declared.join("; ") || "No declara cargos electos previos.",
      origin: "jne",
    },
  };
}

function recordOrFalse(
  query: string,
  profile: OfficialProfile,
  kind: "study" | "work",
  section: string,
): ProfileRule | null {
  const rows = profile.record.filter((item) => item.kind === kind);
  const hit = rows.find((item) => matches(query, item.text, profile.name));
  if (hit) {
    return {
      kind: "verdict",
      verdict: "verdadero",
      confidence: 0.85,
      explanation: `La hoja de vida de ${profile.name} declara ese dato.`,
      source: { title: "Hoja de vida", snippet: hit.text, origin: "jne" },
    };
  }
  if (rows.length === 0) return null;
  return {
    kind: "verdict",
    verdict: "falso",
    confidence: 0.8,
    explanation: `La hoja de vida de ${profile.name} no declara eso en ${section}. El veredicto es falso.`,
    source: { title: "Hoja de vida", snippet: rows.map((item) => item.text).join("; "), origin: "jne" },
  };
}

function namesSomeoneElse(query: string, name: string, party: string): boolean {
  const clues = [...new Set([...mentions(query), ...leadingNames(query)])].filter((word) => {
    const folded = fold(word);
    return folded.length >= 3 && !FILLER.has(folded) && !OFFICES.includes(folded) && !CRIME_WORDS.includes(folded);
  });
  if (clues.length === 0) return false;
  const foldedName = fold(name);
  const foldedParty = fold(party);
  const foreign = clues.filter((word) => {
    const folded = fold(word);
    return !foldedName.includes(folded) && !foldedParty.includes(folded);
  });
  if (foreign.length === 0 || foreign.length !== clues.length) return false;
  const foldedQuery = fold(query);
  return !(foreign.length === 1 && /\bpartido\b|\borganizacion\b/.test(foldedQuery));
}

function partyMatches(folded: string, party: string): boolean {
  const tokens = fold(party)
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !FILLER.has(word));
  if (tokens.length === 0) return true;
  return tokens.some((token) => folded.includes(token));
}

function criminalReading(query: string, profile: OfficialProfile): Extract<ProfileRule, { kind: "verdict" }> | null {
  if (questionKind(query) !== "criminal") return null;
  const folded = fold(query);
  const specific = CRIME_WORDS.some((word) => folded.includes(word));
  if (specific) {
    const hit = profile.sentences.find((item) => crimeInText(folded, item.text));
    if (hit) {
      return resumeVerdict(
        profile,
        "verdadero",
        `La hoja de vida de ${profile.name} registra una sentencia sobre ese hecho.`,
        hit.text,
      );
    }
    if (profile.sentences.length > 0) {
      const declared = profile.sentences.map((item) => item.text).join("; ");
      return resumeVerdict(
        profile,
        "falso",
        `La hoja de vida de ${profile.name} no declara ese delito. Sí declara: ${declared}.`,
        declared,
      );
    }
    return resumeVerdict(
      profile,
      "falso",
      `La hoja de vida de ${profile.name} no registra una sentencia sobre ese hecho. En estas elecciones el veredicto es falso.`,
      "No hay una sentencia declarada sobre ese hecho.",
    );
  }
  if (profile.sentences.length > 0) {
    const declared = profile.sentences.map((item) => item.text).join("; ");
    return resumeVerdict(
      profile,
      "verdadero",
      `La hoja de vida de ${profile.name} declara antecedentes penales.`,
      declared,
    );
  }
  return resumeVerdict(
    profile,
    "falso",
    `La hoja de vida de ${profile.name} no declara antecedentes penales.`,
    "No declara antecedentes penales.",
  );
}

function resumeVerdict(
  _profile: OfficialProfile,
  verdict: "verdadero" | "falso",
  explanation: string,
  snippet: string,
): Extract<ProfileRule, { kind: "verdict" }> {
  return {
    kind: "verdict",
    verdict,
    confidence: 0.9,
    explanation,
    source: { title: "Hoja de vida", snippet, origin: "jne" },
  };
}

function crimeInText(query: string, text: string): boolean {
  const folded = fold(text);
  return CRIME_WORDS.filter((word) => query.includes(word)).some((word) => folded.includes(word.slice(0, 5)));
}

function factTokens(query: string, name: string): string[] {
  const skipped = new Set(fold(name).split(/\s+/).filter((word) => word.length > 2));
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const word of query.match(/\p{L}+/gu) ?? []) {
    const folded = fold(word);
    if (folded.length < 5 || FILLER.has(folded) || skipped.has(folded) || seen.has(folded)) continue;
    seen.add(folded);
    tokens.push(word);
  }
  return tokens;
}

function matches(query: string, text: string, name: string, kind?: OfficialProfile["record"][number]["kind"]): boolean {
  if (kind === "elected" && !officeAgrees(query, text)) return false;
  const folded = fold(text);
  return factTokens(query, name).some((token) => {
    const tokenFolded = fold(token);
    if (OFFICES.includes(tokenFolded)) return false;
    const root = tokenFolded.startsWith("ex") && tokenFolded.length > 6 ? tokenFolded.slice(2) : tokenFolded;
    return folded.includes(root);
  });
}

function officeAgrees(query: string, text: string): boolean {
  const named = OFFICES.find((office) => fold(query).includes(office));
  if (!named) return true;
  return fold(text).includes(named);
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
