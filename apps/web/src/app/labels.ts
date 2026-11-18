import type { ClaimVerdict, DecisionAnswer, SourceRef } from "@tumi/contracts";

const PASOS: Record<string, string> = {
  transcripcion: "Transcripción",
  lectura: "Lectura de la imagen",
  atribucion: "¿Lo dijo?",
  identificacion: "Identificación",
  extraccion: "Extracción",
  investigacion: "Investigación",
  recuperacion: "Recuperación",
  verificacion: "Verificación",
  explicacion: "Explicación",
};

const ESTADOS: Record<string, string> = {
  start: "en curso",
  done: "listo",
};

const TIPOS: Record<string, string> = {
  refusal: "sin respuesta",
  predicate: "probabilidad",
  choice: "elección",
  score: "puntaje",
};

const ORIGENES: Record<string, string> = {
  jne: "padrón",
  tavily: "web",
  plan: "plan",
  adjunto: "adjunto",
  cdn: "plan",
};

export function stepLabel(node: string): string {
  if (PASOS[node]) return PASOS[node];
  return node.replace(/^afirmacion/, "Afirmación");
}

export function statusLabel(status: string): string {
  return ESTADOS[status] ?? status;
}

export function typeLabel(type: string): string {
  return TIPOS[type] ?? type;
}

export function originLabel(origin: string): string {
  return ORIGENES[origin] ?? origin;
}

export function stanceLabel(stance: string | null): string {
  if (stance === "afirma") return "La da por cierta";
  if (stance === "desacredita") return "La desacredita";
  if (stance === "menciona") return "Solo la menciona";
  return "Circula, sin clasificar";
}

export function proofSources(sources: SourceRef[]): SourceRef[] {
  return sources.filter((source) => source.role === "prueba");
}

export function referenceSources(sources: SourceRef[]): SourceRef[] {
  return sources.filter((source) => source.role === "referencia");
}

export function contrastSources(sources: SourceRef[]): SourceRef[] {
  return sources.filter((source) => source.role === "contraste");
}

export function documentName(title: string): string {
  const name = title.replace(/, p\. \d+$/, "").trim();
  return name || title;
}

export function checkQuestion(verdict: ClaimVerdict): string {
  if (verdict.check === "said") return "¿Lo dijo?";
  if (verdict.check === "truth") return "¿Es cierto?";
  return "Afirmación";
}

export function contrastedWith(verdict: ClaimVerdict): string | null {
  if (verdict.check === "said" && verdict.sources.length === 0) {
    return "Se contrastó con el plan, la hoja de vida y las redes. No aparece.";
  }
  const sources = verdict.check === "said" ? verdict.sources : proofCitations(verdict.sources);
  const pieces = [...new Set(sources.map((source) => citedPiece(source)))];
  if (pieces.length === 0) return null;
  return `Se contrastó con ${joinList(pieces)}.`;
}

export function proofCitations(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const picked: SourceRef[] = [];
  const ordered = [...proofSources(sources)].sort((left, right) => citationRank(left) - citationRank(right));
  for (const source of ordered) {
    const key = citationKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(source);
  }
  return picked;
}

export function evidenceNote(count: number): string {
  return count > 1
    ? "Aparte del veredicto, esto es lo que dicen las fuentes sobre el dato."
    : "Aparte del veredicto, esto es lo que dice la fuente sobre el dato.";
}

export function supportsCaption(count: number): string {
  return count > 1 ? "Las fuentes dan por cierto el dato" : "La fuente da por cierto el dato";
}

export function deniesCaption(count: number): string {
  return count > 1 ? "Las fuentes lo desmienten" : "La fuente lo desmiente";
}

export function citationLabel(source: SourceRef): string {
  if (isRepublicaCheck(source.url)) return "Verificador LR";
  const outlet = outletLabel(source.url);
  if (outlet) return outlet;
  const portal = stateLabel(source.url);
  if (portal) return portal;
  const network = socialNetwork(source.url);
  if (network) return `Publicación en ${network}`;
  if (source.origin === "tavily") return "Medio";
  if (source.origin === "qdrant") return documentName(source.title);
  if (source.title === "Hoja de vida") return "Hoja de vida";
  if (source.title === "Plan de gobierno" || source.pagina !== null) {
    return "Plan de gobierno";
  }
  return "Padrón";
}

export function sourceLinkText(source: SourceRef): string | null {
  const name = documentName(source.title);
  return name === citationLabel(source) ? null : name;
}

export function primaryCitation(sources: SourceRef[]): SourceRef | null {
  return proofCitations(sources)[0] ?? null;
}

function citationRank(source: SourceRef): number {
  if (isFactCheck(source.url)) return 0;
  if (outletLabel(source.url) || stateLabel(source.url)) return 1;
  if (source.id.startsWith("oficial-")) return 2;
  if (source.title === "Hoja de vida") return 3;
  if (source.pagina !== null && source.codigoExpediente) return 4;
  if (source.origin === "qdrant") return 5;
  return 6;
}

function citationKey(source: SourceRef): string {
  if (socialNetwork(source.url) || isFactCheck(source.url)) return source.url ?? source.id;
  if (source.url && (outletLabel(source.url) || stateLabel(source.url))) return source.url;
  if (source.title === "Hoja de vida") return "hoja";
  if (source.title === "Plan de gobierno" || (source.pagina !== null && source.codigoExpediente)) return "plan";
  if (source.origin === "qdrant") return `doc:${documentName(source.title)}`;
  return source.id;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export interface ClassifierReading {
  supports: number | null;
  denies: number | null;
  strength: number | null;
  strengthText: string | null;
}

export function classifierReading(decisions: DecisionAnswer[]): ClassifierReading {
  const supports = decisions.find((item) => item.type === "predicate" && item.name === "apoya");
  const denies = decisions.find((item) => item.type === "predicate" && item.name === "contradice");
  const strength = decisions.find((item) => item.type === "score" && item.name === "solidez");
  const best =
    strength?.type === "score"
      ? [...strength.probabilities].sort((left, right) => right.probability - left.probability)[0]
      : undefined;
  return {
    supports: supports?.type === "predicate" ? supports.probability : null,
    denies: denies?.type === "predicate" ? denies.probability : null,
    strength: best?.probability ?? (strength?.type === "score" ? strength.confidence : null),
    strengthText: strengthLabel(best?.label ?? null),
  };
}

export function verdictCertainty(verdict: ClaimVerdict): string {
  return `Seguridad de que es ${verdict.verdict.replaceAll("_", " ")}`;
}

export function firmnessCaption(text: string | null): string {
  if (text === "débil") return "La prueba es débil: lo encontrado no alcanza";
  if (text === "media") return "La prueba es media: hay coincidencias, con huecos";
  if (text === "alta") return "La prueba es alta: las fuentes cubren el dato";
  return "Firmeza de la prueba";
}

export function firmnessWidth(text: string | null, probability: number): number {
  if (text === "débil") return 33;
  if (text === "media") return 66;
  if (text === "alta") return 100;
  return Math.round(probability * 100);
}

export function hasReading(verdict: ClaimVerdict): boolean {
  const reading = classifierReading(verdict.decisions);
  return reading.supports !== null || reading.denies !== null || reading.strength !== null;
}

function citedPiece(source: SourceRef): string {
  const network = socialNetwork(source.url);
  if (network) return `una publicación en ${network}`;
  const label = citationLabel(source);
  if (label === "Plan de gobierno") {
    return source.pagina !== null ? `el plan de gobierno, p. ${source.pagina}` : "el plan de gobierno";
  }
  if (label === "Hoja de vida") {
    return source.pagina !== null ? `la hoja de vida, p. ${source.pagina}` : "la hoja de vida";
  }
  if (label === "Padrón") return "el padrón";
  if (label === "Verificador LR") return "el Verificador LR";
  if (label === "Agencia Andina") return "la Agencia Andina";
  if (label === "IPE") return "el IPE";
  if (label === "Poder Judicial") return "el Poder Judicial";
  if (label === "Tribunal Constitucional") return "el Tribunal Constitucional";
  if (label === "Ministerio Público") return "el Ministerio Público";
  if (label === "Contraloría") return "la Contraloría";
  if (label === "El Peruano") return "El Peruano";
  return label;
}

function socialNetwork(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com") || host === "fb.watch") {
      return "Facebook";
    }
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "X";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
    return null;
  } catch {
    return null;
  }
}

const OUTLETS: Array<{ domain: string; label: string }> = [
  { domain: "perucheck.pe", label: "PerúCheck" },
  { domain: "rpp.pe", label: "RPP" },
  { domain: "elcomercio.pe", label: "El Comercio" },
  { domain: "gestion.pe", label: "Gestión" },
  { domain: "peru21.pe", label: "Perú21" },
  { domain: "larepublica.pe", label: "La República" },
  { domain: "andina.pe", label: "Agencia Andina" },
  { domain: "ojo-publico.com", label: "OjoPúblico" },
  { domain: "convoca.pe", label: "Convoca" },
  { domain: "idl-reporteros.pe", label: "IDL-Reporteros" },
  { domain: "ipe.org.pe", label: "IPE" },
  { domain: "latina.pe", label: "Latina" },
  { domain: "americatv.com.pe", label: "América TV" },
  { domain: "canaln.pe", label: "Canal N" },
  { domain: "panamericana.pe", label: "Panamericana" },
  { domain: "exitosanoticias.pe", label: "Exitosa" },
  { domain: "willax.pe", label: "Willax" },
  { domain: "atv.pe", label: "ATV" },
  { domain: "tvperu.gob.pe", label: "TVPerú" },
  { domain: "expreso.com.pe", label: "Expreso" },
  { domain: "diariocorreo.pe", label: "Correo" },
  { domain: "correo.pe", label: "Correo" },
];

const STATE_PORTALS: Array<{ domain: string; label: string }> = [
  { domain: "pj.gob.pe", label: "Poder Judicial" },
  { domain: "tc.gob.pe", label: "Tribunal Constitucional" },
  { domain: "mpfn.gob.pe", label: "Ministerio Público" },
  { domain: "jne.gob.pe", label: "JNE" },
  { domain: "contraloria.gob.pe", label: "Contraloría" },
  { domain: "indecopi.gob.pe", label: "Indecopi" },
  { domain: "sunat.gob.pe", label: "Sunat" },
  { domain: "servir.gob.pe", label: "Servir" },
  { domain: "elperuano.pe", label: "El Peruano" },
  { domain: "gob.pe", label: "gob.pe" },
];

function outletLabel(url: string | null): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return OUTLETS.find((item) => host === item.domain || host.endsWith(`.${item.domain}`))?.label ?? null;
}

function stateLabel(url: string | null): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return STATE_PORTALS.find((item) => host === item.domain || host.endsWith(`.${item.domain}`))?.label ?? null;
}

function isRepublicaCheck(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return (host === "larepublica.pe" || host.endsWith(".larepublica.pe")) && parsed.pathname.startsWith("/verificador");
  } catch {
    return false;
  }
}

function isFactCheck(url: string | null): boolean {
  return isRepublicaCheck(url) || outletLabel(url) === "PerúCheck";
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function strengthLabel(label: string | null): string | null {
  if (label === "debil") return "débil";
  if (label === "media") return "media";
  if (label === "alta") return "alta";
  return null;
}
