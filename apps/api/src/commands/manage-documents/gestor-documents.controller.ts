import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GestorAccounts } from "../../shared/auth/gestor-accounts";
import { GestorGuard } from "../../shared/auth/gestor.guard";
import {
  ApiGestorCreateAccount,
  ApiGestorDeleteDocument,
  ApiGestorDocument,
  ApiGestorDocuments,
  ApiGestorRetention,
  ApiGestorUpload,
} from "../../shared/openapi";
import { ApplyRetentionHandler } from "./apply-retention.handler";
import { DeleteDocumentHandler, documentStatus, listDocuments } from "./delete-document.handler";
import { UploadDocumentHandler } from "./upload-document.handler";

@Controller("gestor")
@UseGuards(GestorGuard)
export class GestorDocumentsController {
  constructor(
    private readonly upload: UploadDocumentHandler,
    private readonly remove: DeleteDocumentHandler,
    private readonly retention: ApplyRetentionHandler,
    private readonly accounts: GestorAccounts,
  ) {}

  @Post("cuentas")
  @ApiGestorCreateAccount()
  createAccount(@Body() body: unknown) {
    return this.accounts.create(body);
  }

  @Get("documentos")
  @ApiGestorDocuments()
  list(@Query("hojaVidaId") hojaVidaId?: string) {
    return listDocuments(hojaVidaId);
  }

  @Post("documentos")
  @ApiGestorUpload()
  uploadPdf(
    @Headers("x-hoja-vida-id") hojaVidaId: string | undefined,
    @Headers("x-filename") filename: string | undefined,
    @Req() request: Request,
  ) {
    return this.upload.execute(hojaVidaId, filename, request);
  }

  @Get("documentos/:id")
  @ApiGestorDocument()
  status(@Param("id") id: string) {
    return documentStatus(id);
  }

  @Delete("documentos/:id")
  @ApiGestorDeleteDocument()
  removePdf(@Param("id") id: string) {
    return this.remove.execute(id);
  }

  @Post("retencion")
  @ApiGestorRetention()
  runRetention() {
    return this.retention.execute();
  }
}
