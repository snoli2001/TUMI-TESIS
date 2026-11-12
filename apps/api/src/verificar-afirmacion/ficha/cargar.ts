import { getPrisma, mediaUrl } from "@tumi/database";
import type { FichaOficial } from "./reglas";

export async function cargarFicha(id: string): Promise<FichaOficial | null> {
  const row = await getPrisma().candidate.findUnique({
    where: { hojaVidaId: id },
    include: {
      list: {
        include: {
          organization: true,
          plan: {
            include: {
              dimensions: {
                orderBy: { id: "asc" },
                include: { proposals: { orderBy: { itemIndex: "asc" } } },
              },
            },
          },
        },
      },
      resume: {
        include: {
          criminal: true,
          obligation: true,
          elected: true,
          work: true,
          education: true,
        },
      },
    },
  });
  if (!row) return null;
  const propuestas = (row.list.plan?.dimensions ?? []).flatMap((dimension) =>
    dimension.proposals.flatMap((proposal) => {
      const texto = [proposal.problema, proposal.objetivo, proposal.indicador, proposal.meta]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(" ");
      return texto ? [{ texto }] : [];
    }),
  );
  const sentencias = [...(row.resume?.criminal ?? []), ...(row.resume?.obligation ?? [])].flatMap((item) => {
    const texto = [item.materia, item.fallo, item.expediente]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" ");
    return texto ? [{ texto }] : [];
  });
  const trayectoria = [
    ...(row.resume?.elected ?? []).flatMap((item) => fila("electo", ["Cargo electo", item.cargo, item.orgPolitica, item.anioDesde, item.anioHasta])),
    ...(row.resume?.work ?? []).flatMap((item) => fila("trabajo", [item.ocupacionProfesion, item.centroTrabajo, item.anioDesde, item.anioHasta])),
    ...(row.resume?.education ?? []).flatMap((item) => fila("estudio", [item.carrera, item.universidad, item.anioBachiller])),
  ];
  const primerNombre = row.nombres.trim().split(/\s+/)[0] ?? "";
  return {
    id: row.hojaVidaId,
    nombre: [row.nombres, row.apellidoPaterno, row.apellidoMaterno].filter(Boolean).join(" "),
    nombreCorto: presentar([primerNombre, row.apellidoPaterno].filter(Boolean).join(" ")),
    cargo: row.cargoEleccion,
    partido: row.list.organization.name,
    fotoUrl: mediaUrl(row.photoR2Key) ?? row.photoSourceUrl,
    codigoExpediente: row.list.codigoExpediente,
    propuestas,
    sentencias,
    trayectoria,
  };
}

function fila(
  clase: "electo" | "trabajo" | "estudio",
  partes: Array<string | null>,
): Array<{ clase: "electo" | "trabajo" | "estudio"; texto: string }> {
  const texto = partes
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  return texto ? [{ clase, texto }] : [];
}

function presentar(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .replace(/\p{L}+/gu, (word) => word.charAt(0).toLocaleUpperCase("es") + word.slice(1));
}
