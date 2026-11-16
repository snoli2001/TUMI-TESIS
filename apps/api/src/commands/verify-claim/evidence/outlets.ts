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
];

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

export function roleForUrl(url: string | null): "prueba" | "contraste" {
  const host = hostOf(url);
  if (!host) return "contraste";
  if (matchesDomain(host, NON_VERIFYING_DOMAINS)) return "contraste";
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
