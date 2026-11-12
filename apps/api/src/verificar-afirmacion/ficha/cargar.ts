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
  return {
    id: row.hojaVidaId,
    nombre: [row.nombres, row.apellidoPaterno, row.apellidoMaterno].filter(Boolean).join(" "),
    cargo: row.cargoEleccion,
    partido: row.list.organization.name,
    fotoUrl: mediaUrl(row.photoR2Key) ?? row.photoSourceUrl,
    codigoExpediente: row.list.codigoExpediente,
    propuestas,
    sentencias,
  };
}
