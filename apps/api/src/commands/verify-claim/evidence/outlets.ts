export const NEWS_DOMAINS = [
  "elcomercio.pe",
  "gestion.pe",
  "peru21.pe",
  "trome.pe",
  "diariocorreo.pe",
  "correo.pe",
  "larepublica.pe",
  "rpp.pe",
  "americatv.com.pe",
  "canaln.pe",
  "latina.pe",
  "panamericana.pe",
  "exitosanoticias.pe",
  "andina.pe",
  "elperuano.pe",
  "ojo-publico.com",
  "idl-reporteros.pe",
  "convoca.pe",
  "wayka.pe",
  "sudaca.pe",
  "caretas.pe",
  "willax.pe",
  "atv.pe",
  "tvperu.gob.pe",
  "capital.com.pe",
  "elbuho.pe",
  "saludconlupa.com",
  "expreso.com.pe",
  "infobae.com",
  "bbc.com",
  "bbc.co.uk",
  "reuters.com",
  "apnews.com",
  "dw.com",
  "elpais.com",
  "cnn.com",
  "cnnespanol.cnn.com",
  "france24.com",
  "efe.com",
  "gob.pe",
  "perucheck.pe",
  "ipe.org.pe",
];

const TRUSTED_OUTLETS: Array<{ domain: string; label: string }> = [
  { domain: "rpp.pe", label: "RPP" },
  { domain: "elcomercio.pe", label: "El Comercio" },
  { domain: "larepublica.pe", label: "La República" },
  { domain: "andina.pe", label: "Agencia Andina" },
  { domain: "ojo-publico.com", label: "OjoPúblico" },
  { domain: "convoca.pe", label: "Convoca" },
  { domain: "idl-reporteros.pe", label: "IDL-Reporteros" },
  { domain: "perucheck.pe", label: "PerúCheck" },
  { domain: "ipe.org.pe", label: "IPE" },
];

export const TRUSTED_DOMAINS = TRUSTED_OUTLETS.map((item) => item.domain);

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

export const STATE_DOMAINS = STATE_PORTALS.map((item) => item.domain);

export function portalsFor(text: string): string[] {
  const folded = text
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const portals: string[] = [];
  if (/sentencia|condena|juzgado|expediente|proceso judicial|sala penal|sala civil/.test(folded)) portals.push("pj.gob.pe");
  if (/fiscalia|ministerio publico|denuncia penal/.test(folded)) portals.push("mpfn.gob.pe");
  if (/vacancia|eleccion|reeleccion|jurado nacional/.test(folded)) portals.push("jne.gob.pe");
  if (/tribunal constitucional|inconstitucional/.test(folded)) portals.push("tc.gob.pe");
  if (/contralor/.test(folded)) portals.push("contraloria.gob.pe");
  if (/indecopi|consumidor/.test(folded)) portals.push("indecopi.gob.pe");
  if (/sunat|impuesto|tribut/.test(folded)) portals.push("sunat.gob.pe");
  if (/servir|servicio civil/.test(folded)) portals.push("servir.gob.pe");
  if (/el peruano|decreto supremo|ley n/.test(folded)) portals.push("elperuano.pe");
  if (portals.length === 0 && /sancion administrativa|resolucion ministerial|inhabilit/.test(folded)) portals.push("gob.pe");
  return [...new Set(portals)].slice(0, 2);
}

export function statePortal(url: string | null): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return STATE_PORTALS.find((item) => matchesDomain(host, [item.domain]))?.label ?? null;
}

export function trustedOutlet(url: string | null): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return TRUSTED_OUTLETS.find((item) => matchesDomain(host, [item.domain]))?.label ?? null;
}

export function isIpeUrl(url: string | null): boolean {
  const host = hostOf(url);
  return host ? matchesDomain(host, ["ipe.org.pe"]) : false;
}

const NON_VERIFYING_DOMAINS = [
  "facebook.com",
  "fb.com",
  "fb.watch",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "wikipedia.org",
  "wikimedia.org",
  "wikidata.org",
  "reddit.com",
  "threads.net",
  "t.me",
  "telegram.me",
  "whatsapp.com",
  "linkedin.com",
  "blogspot.com",
  "wordpress.com",
  "medium.com",
];

const SOCIAL_NETWORKS: Array<{ name: string; domains: string[] }> = [
  { name: "Facebook", domains: ["facebook.com", "fb.com", "fb.watch"] },
  { name: "Instagram", domains: ["instagram.com"] },
  { name: "X", domains: ["x.com", "twitter.com"] },
  { name: "TikTok", domains: ["tiktok.com"] },
];

export const SOCIAL_DOMAINS = ["facebook.com", "instagram.com", "x.com", "tiktok.com"];

export function socialNetwork(url: string | null): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return SOCIAL_NETWORKS.find((network) => matchesDomain(host, network.domains))?.name ?? null;
}

export function isSocialUrl(url: string | null): boolean {
  return socialNetwork(url) !== null;
}

export function isFactCheckUrl(url: string | null): boolean {
  const host = hostOf(url);
  if (!host || !url) return false;
  if (matchesDomain(host, ["perucheck.pe"])) return true;
  try {
    const parsed = new URL(url);
    return (host === "larepublica.pe" || host.endsWith(".larepublica.pe")) && parsed.pathname.startsWith("/verificador");
  } catch {
    return false;
  }
}

export function preferReporting<T extends { url: string | null }>(items: T[]): T[] {
  const hasNews = new Set<string>();
  for (const item of items) {
    const key = pageKey(item.url);
    if (key && !isSecondaryPage(item.url)) hasNews.add(key);
  }
  return items.filter((item) => {
    const key = pageKey(item.url);
    if (!key || !hasNews.has(key)) return true;
    return !isSecondaryPage(item.url);
  });
}

function pageKey(url: string | null): string | null {
  return trustedOutlet(url) ?? hostOf(url);
}

function isSecondaryPage(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return host.startsWith("lrmas.") || path.startsWith("/opinion") || path.startsWith("/tag") || path.startsWith("/autor");
  } catch {
    return false;
  }
}

export function roleForUrl(url: string | null): "prueba" | "contraste" {
  const host = hostOf(url);
  if (!host) return "contraste";
  if (matchesDomain(host, NON_VERIFYING_DOMAINS)) return "contraste";
  if (trustedOutlet(url)) return "prueba";
  if (host === "gob.pe" || host.endsWith(".gob.pe")) return "prueba";
  if (matchesDomain(host, NEWS_DOMAINS)) return "prueba";
  return "contraste";
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function matchesDomain(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
