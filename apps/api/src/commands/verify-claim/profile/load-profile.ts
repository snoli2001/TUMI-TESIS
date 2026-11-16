import { getPrisma, mediaUrl } from "@tumi/database";
import type { OfficialProfile } from "./rules";

export async function loadProfile(id: string): Promise<OfficialProfile | null> {
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
  const proposals = (row.list.plan?.dimensions ?? []).flatMap((dimension) =>
    dimension.proposals.flatMap((proposal) => {
      const text = [proposal.problema, proposal.objetivo, proposal.indicador, proposal.meta]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(" ");
      return text ? [{ text }] : [];
    }),
  );
  const sentences = [...(row.resume?.criminal ?? []), ...(row.resume?.obligation ?? [])].flatMap((item) => {
    const text = [item.materia, item.fallo, item.expediente]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" ");
    return text ? [{ text }] : [];
  });
  const record = [
    ...(row.resume?.elected ?? []).flatMap((item) => rowOf("elected", ["Cargo electo", item.cargo, item.orgPolitica, item.anioDesde, item.anioHasta])),
    ...(row.resume?.work ?? []).flatMap((item) => rowOf("work", [item.ocupacionProfesion, item.centroTrabajo, item.anioDesde, item.anioHasta])),
    ...(row.resume?.education ?? []).flatMap((item) => rowOf("study", [item.carrera, item.universidad, item.anioBachiller])),
  ];
  const firstName = row.nombres.trim().split(/\s+/)[0] ?? "";
  return {
    id: row.hojaVidaId,
    name: [row.nombres, row.apellidoPaterno, row.apellidoMaterno].filter(Boolean).join(" "),
    shortName: present([firstName, row.apellidoPaterno].filter(Boolean).join(" ")),
    office: row.cargoEleccion,
    party: row.list.organization.name,
    fotoUrl: mediaUrl(row.photoR2Key) ?? row.photoSourceUrl,
    codigoExpediente: row.list.codigoExpediente,
    proposals,
    sentences,
    record,
  };
}

function rowOf(
  kind: "elected" | "work" | "study",
  parts: Array<string | null>,
): Array<{ kind: "elected" | "work" | "study"; text: string }> {
  const text = parts
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  return text ? [{ kind, text }] : [];
}

function present(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .replace(/\p{L}+/gu, (word) => word.charAt(0).toLocaleUpperCase("es") + word.slice(1));
}
