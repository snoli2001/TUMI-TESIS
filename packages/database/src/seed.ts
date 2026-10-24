import { getPrisma } from "./client.js";
import {
  demoCandidatos,
  demoDocumentos,
  demoPartidos,
  demoPlanes,
  splitFragmentos,
} from "./demo-data.js";

export async function seedIfEmpty(): Promise<{ seeded: boolean }> {
  const prisma = getPrisma();
  const existing = await prisma.partido.count();
  if (existing > 0) return { seeded: false };
  await upsertDemoCorpus();
  return { seeded: true };
}

export async function upsertDemoCorpus(): Promise<void> {
  const prisma = getPrisma();

  for (const partido of demoPartidos) {
    await prisma.partido.upsert({
      where: { id: partido.id },
      create: { ...partido, demostracion: true },
      update: { nombre: partido.nombre, sigla: partido.sigla, demostracion: true },
    });
  }

  for (const candidato of demoCandidatos) {
    await prisma.candidato.upsert({
      where: { id: candidato.id },
      create: { ...candidato, demostracion: true },
      update: {
        nombre: candidato.nombre,
        cargo: candidato.cargo,
        biografia: candidato.biografia,
        partidoId: candidato.partidoId,
        demostracion: true,
      },
    });
  }

  for (const plan of demoPlanes) {
    await prisma.planGobierno.upsert({
      where: { id: plan.id },
      create: { ...plan, demostracion: true },
      update: {
        titulo: plan.titulo,
        resumen: plan.resumen,
        candidatoId: plan.candidatoId,
        demostracion: true,
      },
    });
  }

  for (const documento of demoDocumentos) {
    await prisma.documento.upsert({
      where: { id: documento.id },
      create: {
        id: documento.id,
        titulo: documento.titulo,
        contenido: documento.contenido,
        candidatoId: documento.candidatoId,
        origen: "jne",
        url: null,
        demostracion: true,
      },
      update: {
        titulo: documento.titulo,
        contenido: documento.contenido,
        candidatoId: documento.candidatoId,
        origen: "jne",
        demostracion: true,
      },
    });

    await prisma.fragmento.deleteMany({ where: { documentoId: documento.id } });
    const partes = splitFragmentos(documento.contenido);
    await prisma.fragmento.createMany({
      data: partes.map((texto, orden) => ({
        id: `${documento.id}-f${orden}`,
        documentoId: documento.id,
        texto,
        orden,
      })),
    });
  }
}

const isDirectRun = process.argv[1]?.includes("seed");
if (isDirectRun) {
  upsertDemoCorpus()
    .then(async () => {
      const { disconnectPrisma } = await import("./client.js");
      await disconnectPrisma();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      const { disconnectPrisma } = await import("./client.js");
      await disconnectPrisma();
      process.exit(1);
    });
}
