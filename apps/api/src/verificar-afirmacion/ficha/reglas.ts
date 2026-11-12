import { menciones, nombresAlInicio } from "../grafo/menciones";

export interface FichaOficial {
  id: string;
  nombre: string;
  nombreCorto: string;
  cargo: string;
  partido: string;
  fotoUrl: string | null;
  codigoExpediente: string | null;
  propuestas: Array<{ texto: string }>;
  sentencias: Array<{ texto: string }>;
  trayectoria: Array<{ clase: "electo" | "trabajo" | "estudio"; texto: string }>;
}

export interface FuenteDeRegla {
  titulo: string;
  snippet: string;
  origin: "jne" | "qdrant";
}

export type Regla =
  | { tipo: "fuera"; mensaje: string }
  | {
      tipo: "veredicto";
      verdict: "verdadero" | "falso";
      confianza: number;
      explicacion: string;
      fuente: FuenteDeRegla;
    };

const DELITO = [
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

const CARGOS_PREVIOS = [
  "congresista",
  "parlamentario",
  "diputado",
  "senador",
  "exalcalde",
  "exregidor",
  "exgobernador",
  "ministro",
];

const CARGOS = [
  "alcalde distrital",
  "alcalde provincial",
  "gobernador regional",
  "gobernador",
  "alcalde",
  "regidor",
  "consejero",
  "presidente",
];

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
  "sobre",
  "entre",
  "desde",
  "hasta",
  "el",
  "la",
  "don",
  "dona",
]);

export function decidir(query: string, ficha: FichaOficial): Regla | null {
  if (personaAjena(query, ficha.nombre, ficha.partido)) {
    return {
      tipo: "fuera",
      mensaje: `Esta verificación es solo de ${ficha.nombre}, ${ficha.cargo} por ${ficha.partido}, en las Elecciones Regionales y Municipales de 2026. El texto nombra a otra persona.`,
    };
  }

  const plano = plegar(query);
  if (DELITO.some((word) => plano.includes(word))) {
    const hit = ficha.sentencias.find((item) => delitoEnTexto(plano, item.texto));
    if (!hit) {
      return {
        tipo: "veredicto",
        verdict: "falso",
        confianza: 0.9,
        explicacion: `La hoja de vida de ${ficha.nombre} no registra una sentencia sobre ese hecho. En estas elecciones el veredicto es falso.`,
        fuente: {
          titulo: "Hoja de vida",
          snippet: "No hay una sentencia declarada sobre ese hecho.",
          origin: "jne",
        },
      };
    }
    return {
      tipo: "veredicto",
      verdict: "verdadero",
      confianza: 0.9,
      explicacion: `La hoja de vida de ${ficha.nombre} registra una sentencia sobre ese hecho.`,
      fuente: {
        titulo: "Hoja de vida",
        snippet: hit.texto,
        origin: "jne",
      },
    };
  }

  const cargo = CARGOS.find((item) => plano.includes(item));
  if (cargo && !plegar(ficha.cargo).includes(cargo)) {
    return {
      tipo: "veredicto",
      verdict: "falso",
      confianza: 0.95,
      explicacion: `${ficha.nombre} postula a ${ficha.cargo} por ${ficha.partido} en las Elecciones Regionales y Municipales de 2026. El cargo que se afirma no coincide.`,
      fuente: {
        titulo: "Padrón",
        snippet: `${ficha.nombre} · ${ficha.cargo} · ${ficha.partido}`,
        origin: "jne",
      },
    };
  }

  if (/\bpartido\b|\borganizacion\b/.test(plano) && !partidoCoincide(plano, ficha.partido)) {
    return {
      tipo: "veredicto",
      verdict: "falso",
      confianza: 0.95,
      explicacion: `${ficha.nombre} postula por ${ficha.partido}. La organización que se afirma no coincide.`,
      fuente: {
        titulo: "Padrón",
        snippet: `${ficha.nombre} · ${ficha.partido}`,
        origin: "jne",
      },
    };
  }

  if (/promet|promesa|ofrec|plan de gobierno|se compromet/.test(plano)) {
    const hit = ficha.propuestas.find((item) => coincide(query, item.texto, ficha.nombre));
    if (!hit) return null;
    return {
      tipo: "veredicto",
      verdict: "verdadero",
      confianza: 0.85,
      explicacion: `El plan de gobierno de la lista de ${ficha.nombre} contiene esa propuesta.`,
      fuente: {
        titulo: "Plan de gobierno",
        snippet: hit.texto,
        origin: "qdrant",
      },
    };
  }

  const previo = CARGOS_PREVIOS.find((word) => plano.includes(word));
  if (previo) return cargoPrevio(ficha, previo);

  if (/universidad|bachiller|egresad|abogado|ingeniero|medico/.test(plano)) {
    return trayectoriaOFalso(query, ficha, "estudio", "estudios");
  }
  if (/trabajo|gerente|empleo|empresa/.test(plano)) {
    return trayectoriaOFalso(query, ficha, "trabajo", "experiencia laboral");
  }

  const fila = ficha.trayectoria.find((item) => coincide(query, item.texto, ficha.nombre));
  if (fila) {
    return {
      tipo: "veredicto",
      verdict: "verdadero",
      confianza: 0.85,
      explicacion: `La hoja de vida de ${ficha.nombre} declara ese dato.`,
      fuente: { titulo: "Hoja de vida", snippet: fila.texto, origin: "jne" },
    };
  }

  return null;
}

export function consultaWeb(nombreCorto: string, query: string, nombreCompleto: string): string {
  const hecho = tokensDelHecho(query, nombreCompleto).slice(0, 8).join(" ");
  const anio = /postul|candidat|alcald|2026/.test(plegar(query)) ? "2026" : "";
  return [nombreCorto, hecho, anio].filter(Boolean).join(" ").slice(0, 180);
}

function cargoPrevio(ficha: FichaOficial, clave: string): Regla {
  const raiz = clave.replace(/^ex/, "");
  const hit = ficha.trayectoria.find(
    (item) => item.clase === "electo" && plegar(item.texto).includes(raiz),
  );
  if (hit) {
    return {
      tipo: "veredicto",
      verdict: "verdadero",
      confianza: 0.9,
      explicacion: `La hoja de vida de ${ficha.nombre} declara ese cargo.`,
      fuente: { titulo: "Hoja de vida", snippet: hit.texto, origin: "jne" },
    };
  }
  const declarados = ficha.trayectoria.filter((item) => item.clase === "electo").map((item) => item.texto);
  const detalle = declarados.length
    ? `Declara: ${declarados.join("; ")}.`
    : "No declara cargos electos previos.";
  return {
    tipo: "veredicto",
    verdict: "falso",
    confianza: 0.9,
    explicacion: `La hoja de vida de ${ficha.nombre} no declara ese cargo. ${detalle} El veredicto es falso.`,
    fuente: {
      titulo: "Hoja de vida",
      snippet: declarados.join("; ") || "No declara cargos electos previos.",
      origin: "jne",
    },
  };
}

function trayectoriaOFalso(
  query: string,
  ficha: FichaOficial,
  clase: "estudio" | "trabajo",
  seccion: string,
): Regla | null {
  const filas = ficha.trayectoria.filter((item) => item.clase === clase);
  const hit = filas.find((item) => coincide(query, item.texto, ficha.nombre));
  if (hit) {
    return {
      tipo: "veredicto",
      verdict: "verdadero",
      confianza: 0.85,
      explicacion: `La hoja de vida de ${ficha.nombre} declara ese dato.`,
      fuente: { titulo: "Hoja de vida", snippet: hit.texto, origin: "jne" },
    };
  }
  if (filas.length === 0) return null;
  return {
    tipo: "veredicto",
    verdict: "falso",
    confianza: 0.8,
    explicacion: `La hoja de vida de ${ficha.nombre} no declara eso en ${seccion}. El veredicto es falso.`,
    fuente: { titulo: "Hoja de vida", snippet: filas.map((item) => item.texto).join("; "), origin: "jne" },
  };
}

function personaAjena(query: string, nombre: string, partido: string): boolean {
  const pista = [...new Set([...menciones(query), ...nombresAlInicio(query)])].filter((word) => {
    const folded = plegar(word);
    return folded.length >= 3 && !RELLENO.has(folded) && !CARGOS.includes(folded) && !DELITO.includes(folded);
  });
  if (pista.length === 0) return false;
  const plano = plegar(nombre);
  const planoPartido = plegar(partido);
  const ajenas = pista.filter((word) => {
    const folded = plegar(word);
    return !plano.includes(folded) && !planoPartido.includes(folded);
  });
  if (ajenas.length === 0 || ajenas.length !== pista.length) return false;
  const consulta = plegar(query);
  return !(ajenas.length === 1 && /\bpartido\b|\borganizacion\b/.test(consulta));
}

function partidoCoincide(plano: string, partido: string): boolean {
  const tokens = plegar(partido)
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !RELLENO.has(word));
  if (tokens.length === 0) return true;
  return tokens.some((token) => plano.includes(token));
}

function delitoEnTexto(consulta: string, texto: string): boolean {
  const plano = plegar(texto);
  return DELITO.filter((word) => consulta.includes(word)).some((word) => plano.includes(word.slice(0, 5)));
}

function tokensDelHecho(query: string, nombre: string): string[] {
  const omitidos = new Set(plegar(nombre).split(/\s+/).filter((word) => word.length > 2));
  const vistos = new Set<string>();
  const tokens: string[] = [];
  for (const word of query.match(/\p{L}+/gu) ?? []) {
    const folded = plegar(word);
    if (folded.length < 5 || RELLENO.has(folded) || omitidos.has(folded) || vistos.has(folded)) continue;
    vistos.add(folded);
    tokens.push(word);
  }
  return tokens;
}

function coincide(query: string, texto: string, nombre: string): boolean {
  const plano = plegar(texto);
  return tokensDelHecho(query, nombre).some((token) => {
    const folded = plegar(token);
    if (CARGOS.includes(folded)) return false;
    const raiz = folded.startsWith("ex") && folded.length > 6 ? folded.slice(2) : folded;
    return plano.includes(raiz);
  });
}

function plegar(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
