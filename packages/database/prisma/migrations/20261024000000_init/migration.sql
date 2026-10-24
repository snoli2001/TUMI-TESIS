-- CreateTable
CREATE TABLE "partidos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sigla" TEXT,
    "demostracion" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partidos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "candidatos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "biografia" TEXT NOT NULL,
    "demostracion" BOOLEAN NOT NULL DEFAULT true,
    "partido_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidatos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "planes_gobierno" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "demostracion" BOOLEAN NOT NULL DEFAULT true,
    "candidato_id" TEXT NOT NULL,
    CONSTRAINT "planes_gobierno_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "url" TEXT,
    "contenido" TEXT NOT NULL,
    "demostracion" BOOLEAN NOT NULL DEFAULT true,
    "candidato_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fragmentos" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "qdrant_point_id" TEXT,
    "documento_id" TEXT NOT NULL,
    CONSTRAINT "fragmentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consultas" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" JSONB,
    "decisiones" JSONB,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consultas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "candidatos_nombre_idx" ON "candidatos"("nombre");
CREATE INDEX "fragmentos_documento_id_idx" ON "fragmentos"("documento_id");
CREATE INDEX "consultas_session_id_created_at_idx" ON "consultas"("session_id", "created_at");

ALTER TABLE "candidatos" ADD CONSTRAINT "candidatos_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planes_gobierno" ADD CONSTRAINT "planes_gobierno_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "candidatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fragmentos" ADD CONSTRAINT "fragmentos_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
