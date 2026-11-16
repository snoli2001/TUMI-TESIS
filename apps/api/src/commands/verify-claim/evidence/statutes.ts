export interface StatuteRule {
  id: string;
  title: string;
  priority: "high" | "medium";
  topics: RegExp;
}

export const STATUTES: StatuteRule[] = [
  {
    id: "criminal-procedure",
    title: "Código Procesal Penal",
    priority: "high",
    topics: /denuncia|acusacion|medida cautelar|sentencia|condena|\bproceso\b/,
  },
  {
    id: "constitution",
    title: "Constitución",
    priority: "high",
    topics: /presuncion de inocencia|derechos fundamentales|atribuciones constitucionales|\bconstitucion\b/,
  },
  {
    id: "electoral-compendium",
    title: "Compendio electoral",
    priority: "high",
    topics: /reeleccion|candidatura|organizacion politica|postula|postulacion|\bcandidato\b/,
  },
  {
    id: "municipal-law",
    title: "Ley de municipalidades",
    priority: "high",
    topics: /alcalde|concejo|municipalidad|regidor|provincial|distrital/,
  },
  {
    id: "executive-law",
    title: "Ley del Poder Ejecutivo",
    priority: "high",
    topics: /consejo de ministros|poder ejecutivo|ministerios?|\bpresidente\b/,
  },
  {
    id: "criminal-code",
    title: "Código Penal",
    priority: "medium",
    topics: /\bdelito\b|estafa|\brobo\b|homicidio|violacion|peculado|lavado|cohecho|corrupcion|pena privativa/,
  },
  {
    id: "civil-code",
    title: "Código Civil",
    priority: "medium",
    topics: /matrimonio|\bfamilia\b|propiedad|obligacion|\bcontrato\b/,
  },
  {
    id: "transparency-law",
    title: "Ley de transparencia",
    priority: "medium",
    topics: /transparencia|acceso a( la)? informacion/,
  },
];

const OFFICE_CANDIDACY = /sera\b|postula|reeleccion|candidato|alcalde|regidor/;

export function statutesFor(query: string): StatuteRule[] {
  const folded = fold(query);
  const matched = new Map<string, StatuteRule>();
  for (const statute of STATUTES) {
    if (statute.topics.test(folded)) matched.set(statute.id, statute);
  }
  if (matched.has("municipal-law") && OFFICE_CANDIDACY.test(folded)) {
    const electoral = STATUTES.find((statute) => statute.id === "electoral-compendium");
    if (electoral) matched.set(electoral.id, electoral);
  }
  if (matched.has("criminal-procedure") && !/\bdelito\b|estafa|\brobo\b|homicidio|violacion|peculado|lavado|cohecho|corrupcion/.test(folded)) {
    matched.delete("criminal-code");
  }
  const ordered = [...matched.values()].sort((left, right) => {
    if (left.priority === right.priority) return 0;
    return left.priority === "high" ? -1 : 1;
  });
  return ordered.slice(0, 2);
}

function fold(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}
