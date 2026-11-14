import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { getPrisma, documentMaxBytes, saveDocumentFile } from "@tumi/database";
import type { Request } from "express";
import { DocumentQueue } from "./document-queue";
import { isPdf, originalPdfName } from "./pdf";

@Injectable()
export class UploadDocumentHandler {
  constructor(private readonly queue: DocumentQueue) {}

  async execute(hojaVidaId: string | undefined, filename: string | undefined, request: Request) {
    const id = hojaVidaId?.trim() ?? "";
    if (!id) throw new BadRequestException("Falta el candidato");
    const candidate = await getPrisma().candidate.findUnique({ where: { hojaVidaId: id } });
    if (!candidate) throw new NotFoundException("Candidato no encontrado");

    const bytes = await readBody(request, documentMaxBytes());
    if (!isPdf(bytes)) throw new BadRequestException("El archivo tiene que ser un PDF");

    const documentId = randomUUID();
    const storageName = `${documentId}.pdf`;
    await saveDocumentFile(storageName, bytes);
    await getPrisma().candidateDocument.create({
      data: {
        id: documentId,
        hojaVidaId: id,
        originalName: originalPdfName(filename),
        storageName,
        byteSize: bytes.length,
        status: "pending",
      },
    });
    try {
      await this.queue.enqueue(documentId);
    } catch (error) {
      await getPrisma().candidateDocument.update({
        where: { id: documentId },
        data: { status: "failed" },
      });
      throw error;
    }
    return { id: documentId, status: "pending" as const, available: false };
  }
}

function readBody(request: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new PayloadTooLargeException("El PDF supera el tamaño admitido"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
