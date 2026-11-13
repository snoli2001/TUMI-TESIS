export const DOMINIOS_MEDIO = [
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

const DOMINIOS_NO_VERIFICAN = [
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

export function rolDeUrl(url: string | null): "prueba" | "contraste" {
  const host = hostDe(url);
  if (!host) return "contraste";
  if (coincide(host, DOMINIOS_NO_VERIFICAN)) return "contraste";
  if (host === "gob.pe" || host.endsWith(".gob.pe")) return "prueba";
  if (coincide(host, DOMINIOS_MEDIO)) return "prueba";
  return "contraste";
}

function hostDe(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function coincide(host: string, dominios: string[]): boolean {
  return dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`));
}
