import { applyDecorators, type INestApplication } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
  DocumentBuilder,
  SwaggerModule,
  type SchemaObject,
} from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { Response } from "express";

const errorSchema: SchemaObject = {
  type: "object",
  properties: {
    message: { type: "string" },
    error: { type: "string" },
    statusCode: { type: "integer" },
  },
};

const geoItemSchema: SchemaObject = {
  type: "object",
  properties: {
    code: { type: "string" },
    name: { type: "string" },
  },
};

const candidateSummarySchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", description: "hojaVidaId" },
    nombre: { type: "string" },
    cargo: { type: "string" },
    partido: { type: "string" },
    sigla: { type: "string", nullable: true },
    fotoUrl: { type: "string", nullable: true },
    logoUrl: { type: "string", nullable: true },
    demostracion: { type: "boolean" },
  },
};

const gestorProfileSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string" },
    name: { type: "string" },
  },
};

const documentSchema: SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    hojaVidaId: { type: "string" },
    originalName: { type: "string" },
    status: { type: "string", example: "pending" },
    pageCount: { type: "integer", nullable: true },
    available: { type: "boolean" },
  },
};

function badRequest(description: string) {
  return ApiBadRequestResponse({ description, schema: errorSchema });
}

function unauthorized(description: string) {
  return ApiUnauthorizedResponse({ description, schema: errorSchema });
}

export function mountApiReference(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("TUMI")
    .setDescription(
      "Comprueba un dato sobre un candidato. Un modelo de decisión elige el veredicto. Otro modelo solo redacta la explicación.",
    )
    .setVersion("0.1.0")
    .addTag("Salud")
    .addTag("Geografía")
    .addTag("Candidatos")
    .addTag("Verificación")
    .addTag("Historial")
    .addTag("Gestor")
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "X-Session-Key",
        description: "Llave de la visita. Al menos 16 caracteres.",
      },
      "session",
    )
    .addCookieAuth("tumi_gestor", { type: "apiKey", in: "cookie" }, "gestor")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  app.getHttpAdapter().get("/api/openapi.json", (_request: unknown, response: Response) => {
    response.json(document);
  });
  app.use("/api/docs", apiReference({ content: document }));
}

export const ApiHealth = () =>
  applyDecorators(
    ApiTags("Salud"),
    ApiOperation({ summary: "Estado del API", description: "Dice si Postgres, Redis y Qdrant responden." }),
    ApiOkResponse({
      schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "degraded"] },
          checks: {
            type: "object",
            properties: {
              postgres: { type: "boolean" },
              redis: { type: "boolean" },
              qdrant: { type: "boolean" },
              checkpoint: { type: "string", enum: ["postgres", "memory"] },
            },
          },
        },
      },
    }),
  );

export const ApiDepartments = () =>
  applyDecorators(
    ApiTags("Geografía"),
    ApiOperation({ summary: "Departamentos" }),
    ApiOkResponse({ schema: { type: "array", items: geoItemSchema } }),
  );

export const ApiProvinces = () =>
  applyDecorators(
    ApiTags("Geografía"),
    ApiOperation({ summary: "Provincias", description: "Sin departmentCode la lista vuelve vacía." }),
    ApiQuery({ name: "departmentCode", required: false, description: "Código del departamento." }),
    ApiOkResponse({ schema: { type: "array", items: geoItemSchema } }),
  );

export const ApiDistricts = () =>
  applyDecorators(
    ApiTags("Geografía"),
    ApiOperation({ summary: "Distritos", description: "Sin provinceCode la lista vuelve vacía." }),
    ApiQuery({ name: "provinceCode", required: false, description: "Código de la provincia." }),
    ApiOkResponse({ schema: { type: "array", items: geoItemSchema } }),
  );

export const ApiCandidateSearch = () =>
  applyDecorators(
    ApiTags("Candidatos"),
    ApiOperation({
      summary: "Buscar candidatos",
      description: "Hace falta un nombre o un distrito. Si faltan los dos, la lista vuelve vacía.",
    }),
    ApiQuery({ name: "q", required: false, description: "Nombre o apellido." }),
    ApiQuery({ name: "departamento", required: false }),
    ApiQuery({ name: "provincia", required: false }),
    ApiQuery({ name: "distrito", required: false }),
    ApiQuery({ name: "organizacion", required: false }),
    ApiQuery({ name: "sexo", required: false }),
    ApiQuery({ name: "orden", required: false, description: "nombre u organizacion. Si no viene, ordena por nombre." }),
    ApiQuery({ name: "experienciaElectoral", required: false, description: "true o 1 para activar el filtro." }),
    ApiQuery({ name: "sinSentencias", required: false, description: "true o 1 para activar el filtro." }),
    ApiQuery({ name: "primaria", required: false, description: "true o 1 para activar el filtro." }),
    ApiQuery({ name: "secundaria", required: false, description: "true o 1 para activar el filtro." }),
    ApiQuery({ name: "superiores", required: false, description: "true o 1 para activar el filtro." }),
    ApiQuery({ name: "trabajo", required: false, description: "true o 1 para activar el filtro." }),
    ApiOkResponse({
      schema: {
        type: "object",
        properties: {
          resultados: { type: "array", items: candidateSummarySchema },
          total: { type: "integer" },
          organizaciones: { type: "array", items: { type: "string" } },
          sexos: { type: "array", items: { type: "string" } },
        },
      },
    }),
  );

export const ApiCandidateDetail = () =>
  applyDecorators(
    ApiTags("Candidatos"),
    ApiOperation({ summary: "Ver ficha", description: "Hoja de vida y plan de gobierno." }),
    ApiParam({ name: "id", description: "hojaVidaId" }),
    ApiOkResponse({
      schema: {
        allOf: [
          candidateSummarySchema,
          {
            type: "object",
            properties: {
              hojaVida: { type: "object", nullable: true, description: "Datos declarados en la hoja de vida." },
              plan: { type: "object", nullable: true, description: "Plan de gobierno de la lista." },
            },
          },
        ],
      },
    }),
    ApiNotFoundResponse({ description: "Candidato no encontrado.", schema: errorSchema }),
  );

export const ApiFactCheckStream = () =>
  applyDecorators(
    ApiTags("Verificación"),
    ApiSecurity("session"),
    ApiOperation({
      summary: "Comprobar una afirmación",
      description:
        "Responde con eventos: node, decision, token, result y error. Hace falta un candidato. La misma puerta está en /api/fact-check/stream y /api/verificar-afirmacion/stream.",
    }),
    ApiBody({
      schema: {
        type: "object",
        required: ["hojaVidaId"],
        properties: {
          query: { type: "string", maxLength: 2000, description: "Dato escrito. Puede ir corto si adjuntas una imagen." },
          sessionId: { type: "string", description: "Visita. Si no es un UUID, el API abre una nueva." },
          hojaVidaId: { type: "string" },
          image: {
            type: "object",
            properties: {
              mediaType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
              data: { type: "string", description: "Imagen en base64, hasta 4 MB." },
            },
          },
        },
      },
    }),
    ApiProduces("text/event-stream"),
    ApiOkResponse({
      description: "El stream se cierra cuando termina la comprobación.",
      content: { "text/event-stream": { schema: { type: "string" } } },
    }),
    badRequest("Consulta inválida, sin candidato o con una imagen que no sirve."),
    unauthorized("Falta la llave o no corresponde a la sesión."),
  );

export const ApiHistory = () =>
  applyDecorators(
    ApiTags("Historial"),
    ApiSecurity("session"),
    ApiOperation({
      summary: "Leer el historial",
      description: "Solo los turnos de esta visita. La misma lectura está en /api/history y /api/consultar-historial.",
    }),
    ApiQuery({ name: "sessionId", required: true, description: "UUID de la visita." }),
    ApiOkResponse({
      schema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            query: { type: "string" },
            conclusion: { type: "string" },
            verdict: { type: "string", nullable: true },
            degraded: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            candidate: { type: "object", nullable: true },
          },
        },
      },
    }),
    unauthorized("Falta la sesión o la llave no corresponde."),
  );

export const ApiGestorLogin = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiOperation({ summary: "Entrar", description: "Deja la cookie tumi_gestor. La contraseña tiene al menos 8 caracteres." }),
    ApiBody({
      schema: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string" },
          password: { type: "string" },
        },
      },
    }),
    ApiCreatedResponse({ description: "Perfil del gestor.", schema: gestorProfileSchema }),
    unauthorized("Correo o contraseña incorrectos."),
    badRequest("Correo o contraseña inválidos."),
  );

export const ApiGestorLogout = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({ summary: "Salir" }),
    ApiOkResponse({ schema: { type: "object", properties: { ok: { type: "boolean" } } } }),
  );

export const ApiGestorCurrent = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({ summary: "Ver la sesión" }),
    ApiOkResponse({ schema: gestorProfileSchema }),
    unauthorized("Inicia sesión."),
  );

export const ApiGestorCreateAccount = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({ summary: "Crear otra cuenta" }),
    ApiBody({
      schema: {
        type: "object",
        required: ["email", "name", "password"],
        properties: {
          email: { type: "string" },
          name: { type: "string" },
          password: { type: "string" },
        },
      },
    }),
    ApiCreatedResponse({ schema: gestorProfileSchema }),
    badRequest("Correo, nombre o contraseña inválidos."),
    ApiConflictResponse({ description: "Ese correo ya tiene una cuenta.", schema: errorSchema }),
    unauthorized("Inicia sesión."),
  );

export const ApiGestorDocuments = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({ summary: "Listar documentos" }),
    ApiQuery({ name: "hojaVidaId", required: true }),
    ApiOkResponse({ schema: { type: "array", items: documentSchema } }),
    badRequest("Falta el candidato."),
    unauthorized("Inicia sesión."),
  );

export const ApiGestorUpload = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({ summary: "Subir un PDF", description: "El cuerpo es el archivo, no un JSON. El tope por defecto es 15 MB." }),
    ApiConsumes("application/pdf"),
    ApiHeader({ name: "X-Hoja-Vida-Id", required: true }),
    ApiHeader({ name: "X-Filename", required: false, description: "Nombre original del archivo." }),
    ApiBody({ schema: { type: "string", format: "binary" } }),
    ApiCreatedResponse({
      schema: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string", example: "pending" },
          available: { type: "boolean" },
        },
      },
    }),
    badRequest("Falta el candidato o el archivo no es un PDF."),
    ApiNotFoundResponse({ description: "Candidato no encontrado.", schema: errorSchema }),
    unauthorized("Inicia sesión."),
  );

export const ApiGestorDocument = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({ summary: "Ver el estado de un documento" }),
    ApiParam({ name: "id", description: "Id del documento." }),
    ApiOkResponse({ schema: documentSchema }),
    ApiNotFoundResponse({ description: "Documento no encontrado.", schema: errorSchema }),
    unauthorized("Inicia sesión."),
  );

export const ApiGestorDeleteDocument = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({ summary: "Retirar un documento" }),
    ApiParam({ name: "id", description: "Id del documento." }),
    ApiOkResponse({
      schema: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", example: "deleted" },
        },
      },
    }),
    ApiNotFoundResponse({ description: "Documento no encontrado.", schema: errorSchema }),
    unauthorized("Inicia sesión."),
  );

export const ApiGestorRetention = () =>
  applyDecorators(
    ApiTags("Gestor"),
    ApiCookieAuth("gestor"),
    ApiOperation({
      summary: "Aplicar la retención",
      description: "Borra visitas y documentos que ya pasaron su plazo.",
    }),
    ApiCreatedResponse({
      schema: {
        type: "object",
        properties: {
          sessions: { type: "integer" },
          documents: { type: "integer" },
        },
      },
    }),
    unauthorized("Inicia sesión."),
  );
