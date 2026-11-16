# TUMI — qué está hecho, en palabras simples

TUMI ayuda a comprobar si algo que se dice de un candidato es cierto.

La persona elige su distrito, abre la ficha de un candidato y escribe un dato. El sistema lo compara con la hoja de vida, el plan de gobierno, los documentos que subió un gestor y las noticias. Al final dice si ese dato es verdadero, falso, engañoso o si no se puede comprobar.

Hay dos inteligencias artificiales, y no hacen lo mismo:

- Una **decide**. Elige el veredicto y dice qué tan segura está. No escribe el texto que lee la persona.
- Otra **redacta**. Explica con frases el veredicto que ya quedó cerrado. No puede cambiarlo.

Este texto explica cómo está armado el programa: las carpetas, las formas de organizar el código, las guías que se usaron al programar y las cualidades que el sistema intenta cuidar. Cada idea apunta al archivo donde está.

## 1. Qué problema resuelve

La idea de la tesis es esta: cada veredicto tiene que poder rastrearse. Tiene que verse **de dónde salió**.

Hay una regla fija. Si la inteligencia que decide está segura en menos de 55 de cada 100, el sistema no publica «verdadero», «falso» ni «engañoso». Publica «no se puede comprobar» (`no_verificable`).

Esa regla no está escondida en un texto que se le pide al modelo. Está escrita en código. Así no depende de que el modelo «se acuerde» de ser prudente.

```291:314:packages/contracts/src/verdict-policy.ts
/**
 * Aplica el umbral de la aplicación sobre la respuesta `choice` de la Decisions API.
 * Un refusal o una confianza baja dejan el claim en no_verificable.
 * No inventa probabilidades cuando falta el veredicto.
 */
export function resolveVerdict(
  answers: DecisionAnswer[],
  minConfidence: number,
): ResolvedVerdict {
  const verdictAnswer = answers.find((answer) => answer.name === "veredicto");
  if (!verdictAnswer || verdictAnswer.type === "refusal") {
    return { verdict: "no_verificable", confidence: null };
  }
  // ...
  if (verdictAnswer.confidence < minConfidence) {
    return { verdict: "no_verificable", confidence: verdictAnswer.confidence };
  }
  return {
    verdict: verdictAnswer.choice,
    confidence: verdictAnswer.confidence,
  };
}
```

El número 0.55 se lee de la variable `DECISION_MIN_CONFIDENCE`. Si nadie la cambia, vale 0.55. La función está en `apps/api/src/shared/text.ts` y se llama `decisionMinConfidence`.

Qué sí hace hoy el sistema:

- Comprueba datos de candidatos que ya están cargados en la base `goberlab`, esquema `tumi`.
- Acepta un texto escrito, o una imagen (JPG, PNG o WebP, hasta 4 MB) de la que lee el dato.
- Responde solo con cuatro resultados: `verdadero`, `falso`, `enganoso`, `no_verificable`.
- Si no hay clave de OpenAI, igual enciende. Responde «no se puede comprobar» y no inventa un porcentaje de seguridad.

Qué no hace:

- No guarda cada cambio como una lista infinita de eventos. (Eso se llama *event sourcing*. Quedó fuera a propósito.)
- No presenta el resultado como una nota oficial del candidato.

## 2. Cómo está partido el proyecto

El proyecto es un solo repositorio con varias piezas. Se llama **monorepo**: un solo lugar, varios programas que se instalan juntos. El instalador es pnpm. En la computadora de desarrollo hace falta Node 22.22 o más nuevo. La imagen que se despliega usa Node 24.22.

| Carpeta | Qué es, en simple | Nombre técnico |
| --- | --- | --- |
| `apps/web` | La página que ve la persona. | Angular 22 |
| `apps/api` | El programa que recibe las preguntas, decide y guarda. | NestJS 12 |
| `apps/worker` | Un ayudante en segundo plano. Indexa planes y PDFs, y borra lo viejo. | NestJS + BullMQ |
| `packages/contracts` | El acuerdo de formas: qué campos tiene una respuesta. Lo usan la página y el API para no hablar idiomas distintos. | TypeScript + Zod |
| `packages/database` | La puerta a la base de datos. | Prisma sobre Postgres, esquema `tumi` |

Alrededor hay tres servicios más:

- **Redis** guarda colas de trabajo y el contador de «cuántas veces consultó esta persona». Viaja dentro de Docker (`docker-compose.yml`).
- **Postgres** es la base. No está dentro de este Docker. Se usa la base de pruebas de tumi2 (`DATABASE_URL`).
- **Qdrant** guarda trozos de texto convertidos en números, para buscar por significado y no solo por palabra exacta (`QDRANT_URL`).

En producción solo se abre al público la página (`web`). Un nginx recibe las visitas y, si la ruta empieza por `/api`, se las pasa al programa de atrás. El API no tiene una puerta propia hacia internet. Así el streaming (la respuesta que va llegando poco a poco) sí pasa, y el resto queda escondido.

Para desarrollar: `pnpm dev` prepara los contratos y la base, y levanta página, API y worker a la vez. `pnpm test` corre las pruebas.

## 3. Las carpetas dicen qué hace el sistema

Si abres `apps/api/src`, no ves una carpeta genérica llamada `servicios`. Ves carpetas con el nombre de lo que la persona puede hacer: verificar una afirmación, buscar candidatos, ver el historial.

Eso tiene un nombre: **screaming architecture** (arquitectura que grita). La idea es simple. La estructura del disco grita el tema del programa. No grita «aquí hay controladores». Grita «aquí se verifica un dato electoral».

Cada una de esas carpetas trae todo lo de ese caso: la entrada HTTP, la lógica, las reglas y las pruebas. En la página web pasa lo mismo. Cambiar «verificar una afirmación» no obliga a tocar «buscar un candidato».

Eso tiene otro nombre: **vertical slicing** (corte vertical). En vez de capas horizontales (toda la base abajo, toda la pantalla arriba, y la lógica perdida en el medio), cada función es una rebanada de arriba a abajo.

```text
apps/api/src/
  commands/                    cosas que escriben (dejan un resultado guardado)
    verify-claim/              comprobar una afirmación
    manage-documents/          subir, borrar y caducar PDFs
  queries/                     cosas que solo leen
    search-candidates/         buscar candidatos
    view-candidate/            ver la ficha
    consult-history/           ver lo ya comprobado en esta visita
    geo/                       departamentos, provincias y distritos
  shared/                      lo que usan todos: redis, sesión, límite de consultas, salud
```

La página usa los mismos nombres:

| Qué hace la persona | Página | Programa de atrás |
| --- | --- | --- |
| Elige distrito y ve las contiendas | `apps/web/src/app/home/` | `queries/geo` y `queries/search-candidates` |
| Lee hoja de vida y plan | `apps/web/src/app/candidates/view-candidate.*` | `queries/view-candidate` |
| Escribe un dato para comprobar | `apps/web/src/app/candidates/verify-candidate.ts` (va dentro de la ficha) | `commands/verify-claim` |
| Mira lo que ya preguntó | `apps/web/src/app/history/` | `queries/consult-history` |
| Sube PDFs (el gestor) | `apps/web/src/app/gestor/` | `commands/manage-documents` |

Las direcciones de la página están en `apps/web/src/app/app.routes.ts`: `/`, `/candidatos`, `/candidatos/:id`, `/historial` y `/gestor`.

Nest (el marco del API) registra cada caso con su puerta de entrada y su encargado. No hay un cajón único donde se mezcle «guardar un veredicto» con «listar candidatos». La lista está en `apps/api/src/app.module.ts`: salud, verificar afirmación, buscar candidatos, geografía, ver la ficha, historial y el gestor. Al final registra dos porteros para todas las rutas: `AuthGuard` y `RateLimitGuard`.

`shared` es lo único compartido: Redis, el límite de consultas, la sesión de la persona, la entrada del gestor, el chequeo de que el programa está vivo, y cómo se escriben los errores. Redis no vive dentro de un solo caso porque lo usan el límite de consultas y las colas.

Hay una regla de idioma en `.cursor/rules/english-code.mdc`. Los nombres del código van en inglés (`decide`, `VerifyClaimHandler`). Lo que lee la persona, y los valores que ya están guardados, van en español: los veredictos `verdadero` y `falso`, el campo `nombre`, y los papeles de una fuente `prueba` y `contraste`.

## 4. Escribir y leer van por caminos separados

Esto se llama **CQRS**. Las siglas quieren decir: las preguntas que cambian algo y las preguntas que solo miran no usan el mismo camino.

En este proyecto la idea es concreta:

- Un **comando** deja huella. Abre una visita (`fact_session`), corre la comprobación y guarda un turno (`fact_turn`).
- Una **consulta** solo lee. Busca candidatos o lista lo ya guardado. No inserta filas.

El encargado de guardar un veredicto no es el mismo que el encargado de listar el historial. No se reutilizan.

| Acción | ¿Guarda algo? | Dónde está |
| --- | --- | --- |
| Comprobar una afirmación | Sí, un turno | `VerifyClaimHandler` |
| Subir o borrar un PDF | Sí | `UploadDocumentHandler`, `DeleteDocumentHandler` |
| Buscar candidatos | No | `SearchCandidatesHandler` |
| Ver la ficha | No | `ViewCandidateHandler` |
| Ver el historial | No | `ConsultHistoryHandler` |
| Listar departamentos, provincias y distritos | No | `GeoController` |

Tampoco es la misma tabla.

Lo que esta aplicación **no modifica** (viene de la base de tumi2): organizaciones, candidatos, hojas de vida, planes y el mapa de distritos.

Lo que esta aplicación **sí escribe**: las visitas, los turnos, las cuentas del gestor, los PDFs y, aparte, el esquema `langgraph` (la memoria interna del grafo de pasos).

El historial es el ejemplo claro de «solo leer». Pide la llave de la visita, busca turnos cuyo papel es `assistant`, los ordena del más nuevo al más viejo y devuelve como máximo 30.

```7:16:apps/api/src/queries/consult-history/consult-history.handler.ts
export class ConsultHistoryHandler {
  async execute(sessionId: string | undefined, accessKey: string | undefined): Promise<HistoryItem[]> {
    const id = await readSession(sessionId, accessKey);
    if (!id) return [];
    const rows = await getPrisma().factTurn.findMany({
      where: { sessionId: id, role: "assistant" },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
```

Cuando la comprobación termina, se guarda el veredicto, la seguridad, el paquete completo de la respuesta y la lista de decisiones del modelo:

```326:345:apps/api/src/commands/verify-claim/verify-claim.handler.ts
private async save(sessionId: string, payload: FactCheckResult): Promise<FactCheckResult> {
  const turn = await getPrisma().factTurn.create({
    data: {
      sessionId,
      role: "assistant",
      content: payload.conclusion,
      verdict: payload.verdicts[0]?.verdict ?? null,
      confidence: payload.verdicts[0]?.confidence,
      sources: JSON.parse(JSON.stringify(payload)),
      choices: JSON.parse(
        JSON.stringify(
          payload.verdicts.map((verdict) => ({
            claim: verdict.claim,
            decisions: verdict.decisions,
          })),
        ),
      ),
    },
  });
  return { ...payload, id: turn.id.toString() };
}
```

`sources` es el sobre con todo: la pregunta, la conclusión, las citas y el candidato. `choices` es lo que contestó el modelo antes de aplicar el umbral: «esto apoya», «esto contradice», el veredicto propuesto y qué tan sólida ve la evidencia.

## 5. La página y el API hablan el mismo idioma

`packages/contracts` es el diccionario compartido. La página no inventa su propia forma de veredicto. El API no devuelve un JSON distinto del que ya validó.

Los tipos principales están en `packages/contracts/src/verdict-policy.ts`:

- **Veredicto:** verdadero, falso, engañoso o no comprobable.
- **Fuente:** de dónde salió (padrón, Qdrant o prensa), si sirve de prueba o solo de contraste, si la página afirma, desacredita o solo menciona, y la página del PDF o el expediente.
- **Respuesta del modelo:** puede ser un sí/no con probabilidad, una elección entre opciones, una nota de solidez, o un rechazo («no contesto»).
- **Fichas:** candidato, hoja de vida, plan e historial.

Antes de hacer caso al cuerpo de la petición, Zod revisa la forma. Si el texto tiene menos de 3 letras y no hay imagen, rechaza. Esos esquemas están en `packages/contracts/src/index.ts`.

El controlador no se fía del JSON que llega. Lo parsea. Si falla, responde 400 con el primer mensaje de error. Además exige que venga un candidato (`hojaVidaId`). No se comprueba una frase suelta, sin persona.

```9:33:apps/api/src/commands/verify-claim/verify-claim.controller.ts
@Controller(["fact-check", "verificar-afirmacion"])
export class VerifyClaimController {
  @Post("stream")
  async stream(/* ... */): Promise<void> {
    const parsed = factCheckRequestSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Consulta inválida",
      });
      return;
    }
    if (!parsed.data.hojaVidaId) {
      response.status(400).json({ message: "Elige un candidato antes de verificar" });
      return;
    }
```

Al salir, el resultado vuelve a pasar por el mismo esquema (`factCheckResultSchema.parse`). Si el grafo armó algo con una forma rara, esa respuesta no sale hacia la página.

Hay dos direcciones para la misma puerta: `fact-check` y `verificar-afirmacion`. Hacen lo mismo.

## 6. El camino de una comprobación, paso a paso

El camino está dibujado como un **grafo**: una fila de estaciones. Cada estación recibe el estado, hace su parte y se lo pasa a la siguiente. La herramienta se llama LangGraph.

No hay desvíos en el dibujo. Siempre es el mismo orden. Lo que cambia es lo que hace cada estación por dentro, y a veces el programa ni siquiera entra al grafo (eso se explica más abajo).

```6:21:apps/api/src/commands/verify-claim/graph/fact-check.graph.ts
export function buildGraph(deps: AgentDeps, checkpointer: BaseCheckpointSaver) {
  return new StateGraph(TumiAnnotation)
    .addNode("identificacion", (state, config) => identify(state, deps, config))
    .addNode("extraccion", (state, config) => extractClaims(state, deps, config))
    .addNode("investigacion", (state, config) => investigate(state, deps, config))
    .addNode("recuperacion", (state, config) => retrieve(state, deps, config))
    .addNode("verificacion", (state, config) => verify(state, deps, config))
    .addNode("explicacion", (state, config) => explain(state, deps, config))
    .addEdge(START, "identificacion")
    .addEdge("identificacion", "extraccion")
    .addEdge("extraccion", "investigacion")
    .addEdge("investigacion", "recuperacion")
    .addEdge("recuperacion", "verificacion")
    .addEdge("verificacion", "explicacion")
    .addEdge("explicacion", END)
    .compile({ checkpointer });
}
```

| Estación | Qué hace, en simple | Función |
| --- | --- | --- |
| Identificación | Busca de quién se habla. Si hay varios candidatos y el modelo de decisión está activo, elige uno. Si no hay clave, se queda con el primero. | `identify` |
| Extracción | Parte el texto en frases. Si no puede, usa la frase original. | `extractClaims` |
| Investigación | Arma las búsquedas. No es lo mismo preguntar por un delito que por una propuesta del plan. | `investigate` |
| Recuperación | Junta pruebas y páginas de contraste. Ordena las pruebas y deja fuera las que no vienen al caso. | `retrieve` |
| Verificación | Pide el veredicto. Solo le pasa las pruebas, no el contraste. | `verify` |
| Explicación | Redacta el texto que va a leer la persona, palabra por palabra. | `explain` |

El estado es la mochila que viaja entre estaciones. Casi todo se reemplaza: la estación nueva pisa lo anterior. Hay una excepción. La marca `degraded` (degradado, o sea «esto no se pudo juzgar de verdad») se combina con un O: si alguna estación la enciende, se queda encendida.

```9:20:apps/api/src/commands/verify-claim/graph/state.ts
export const TumiAnnotation = Annotation.Root({
  query: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  sessionId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  consultaId: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  entities: Annotation<EntityRef[]>({ reducer: (_left, right) => right, default: () => [] }),
  claims: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  queries: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  evidence: Annotation<EvidenceItem[]>({ reducer: (_left, right) => right, default: () => [] }),
  verdicts: Annotation<ClaimVerdict[]>({ reducer: (_left, right) => right, default: () => [] }),
  conclusion: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  degraded: Annotation<boolean>({ reducer: (left, right) => left || right, default: () => false }),
});
```

Las estaciones no llaman ellas mismas a OpenAI, a Qdrant ni a la base. Reciben una lista de funciones ya armadas (`AgentDeps`): buscar candidatos, elegir candidato, extraer frases, planear búsquedas, buscar evidencia, reordenar, clasificar la circulación, juzgar y explicar.

Eso es un **puerto**. La estación dice «necesito juzgar esto». No sabe si por detrás hay OpenAI, una prueba falsa o Postgres. El handler (el encargado) enchufa las implementaciones reales en `deps()`. Así se puede probar el camino sin levantar internet.

También hay memoria del recorrido. Se llama **checkpointer**. En producción guarda cada paso en Postgres, esquema `langgraph`, atado al id de la visita (`thread_id`). Si al arrancar Postgres no responde, usa memoria de proceso y anota `checkpoint = "memory"`. Esa memoria se pierde si el programa se reinicia.

```453:467:apps/api/src/commands/verify-claim/verify-claim.handler.ts
private async openCheckpointer(): Promise<BaseCheckpointSaver> {
  try {
    const connectionString =
      process.env.DATABASE_URL ?? "postgresql://tumi:tumi@localhost:5432/tumi";
    const saver = PostgresSaver.fromConnString(connectionString, { schema: "langgraph" });
    await saver.setup();
    this.checkpoint = "postgres";
    return saver;
  } catch (error) {
    this.logger.warn(
      `Checkpoint de Postgres no disponible, se usa memoria: ${error instanceof Error ? error.message : error}`,
    );
    this.checkpoint = "memory";
    return new MemorySaver();
  }
}
```

### A veces ni entra al grafo

Si la hoja de vida o el plan ya contestan la pregunta, no hace falta buscar en internet ni llamar al juez. La función `decide()` en `profile/rules.ts` devuelve el veredicto con una regla fija. Si el redactor está disponible, solo explica esa regla. No la cambia.

Cuando la petición trae un candidato, el orden es este:

1. Se carga la ficha (`load-profile.ts`).
2. Si hay imagen, se lee (`LlmService.readClaim`) y se antepone una línea que dice qué se leyó.
3. Si la imagen es una frase que el candidato habría dicho, primero se busca si de verdad aparece en el plan o en la hoja (`fromStatements`). Después se comprueba si esa frase es cierta.
4. Si `decide()` ya tiene una regla, y la pregunta no es de delito, ni de una propuesta abierta, ni de otro cargo, se responde con la regla (`fromRule`).
5. Si nada de eso aplica, se entra al grafo con el candidato ya fijado. La estación de identificación no vuelve a buscar en el padrón: devuelve a esa persona.

Hay una regla de oro, escrita como función. Si la persona escribió **una sola oración**, se juzga esa oración. No se premia la primera parte verdadera y se ignora el resto.

```121:126:apps/api/src/commands/verify-claim/profile/rules.ts
export function claimsToJudge(query: string, extracted: string[]): string[] {
  const sentence = query.trim();
  if (sentence && isSingleSentence(sentence)) return [sentence];
  const parts = extracted.map((item) => item.trim()).filter((item) => item.length > 0);
  return parts.length > 0 ? parts : [sentence];
}
```

El tipo de pregunta (`questionKind`) sale de las palabras. Si habla de delito o condena, es `criminal`. Si habla de promesa o plan, es `proposal`. Si no, es `other`. Ese tipo elige qué se busca y si se incluye el plan de gobierno.

Ejemplo ya programado. Si alguien dice «nunca fue ministro», el sistema busca el hecho positivo («fulano fue ministro»), con un tope de dos búsquedas. Que la hoja de vida no lo mencione no prueba que nunca lo fue.

## 7. Quién decide y quién redacta

Son dos archivos distintos a propósito.

`DecisionsService` (`commands/verify-claim/decisions/decisions.service.ts`) habla con la Decisions API de OpenAI. El modelo por defecto es `gpt-6-luna` (`OPENAI_DECISION_MODEL`). No escribe párrafos. Hace preguntas de tipo cerrado:

| Pregunta | Tipo | Para qué |
| --- | --- | --- |
| ¿De cuál candidato hablan? | Elegir uno | Si hay varios con nombre parecido. |
| ¿Este párrafo sirve? | Sí o no, con probabilidad | Dejar solo los trozos útiles. El mínimo es 0.4 (`DECISION_RELEVANCE_MIN`). Como máximo se quedan 8. |
| ¿Esta página afirma, niega o solo menciona? | Elegir una postura | Marcar lo que **no** es prueba. Esta pregunta no dice si el dato es verdad. |
| ¿El dato es verdadero, falso, engañoso o no comprobable? | Apoya, contradice, veredicto y solidez | El juicio. Solo ve la evidencia que se le adjuntó. |

Si no hay clave, el juicio devuelve «no se puede comprobar», seguridad vacía, marca de degradado y cero decisiones. No inventa un 70 % para que se vea serio.

`LlmService` (`drafting/llm.service.ts`) saca las frases, planea búsquedas, lee imágenes y redacta. Recibe el veredicto ya cerrado.

El texto que se le manda al juez fija la política que la tesis tiene que poder citar. Entre otras cosas:

- Unos medios cuentan como prueba: RPP, El Comercio, La República, Andina, OjoPúblico, Convoca, IDL-Reporteros, PerúCheck y el IPE.
- Una denuncia no es una condena.
- Una promesa no prueba que la obra ya se entregó.
- Unión civil no es matrimonio igualitario.
- «El mejor» o «potencia mundial», sin número, periodo y fuente, no se puede comprobar.

## 8. Qué cuenta como prueba y qué no

No toda página que aparece en una búsqueda sostiene el veredicto. Cada fuente tiene un **papel**:

- **Prueba** (`prueba`): la hoja de vida, el plan, un PDF del candidato, una norma que explica la regla, y una nota de un medio de prueba que habla del hecho.
- **Contraste** (`contraste`): redes, blogs, Wikipedia y el resto de la web. Se muestran aparte, para que la persona vea qué circula. No entran al juez.

Antes de juzgar, el código se queda solo con lo que no es contraste (`item.role !== "contraste"`).

La búsqueda junta dos maneras de encontrar texto y luego quita repetidos:

- Por **palabras**, en Postgres: las propuestas del plan.
- Por **significado**, en Qdrant: trozos convertidos en vectores con `text-embedding-3-large` (3072 números). La colección se llama `tumi_evidence`.

```80:88:apps/api/src/commands/verify-claim/evidence/vector-search.service.ts
async search(query: string, scope: EvidenceScope): Promise<EvidenceItem[]> {
  const hojaVidaIds = await this.readyDocumentOwners(scope.hojaVidaIds ?? []);
  const narrowed = { ...scope, hojaVidaIds };
  const lexical =
    scope.includePlan === false ? [] : await this.searchPostgres(query, narrowed.codigoExpedientes);
  const semantic = await this.searchQdrant(query, narrowed);
  const merged = new Map<string, EvidenceItem>();
  for (const item of [...semantic, ...lexical]) merged.set(item.id, item);
  return this.conEnlace([...merged.values()].slice(0, 12));
}
```

Antes de comparar parecidos, Qdrant filtra. Un plan solo entra si es de ese expediente. Un adjunto de la visita solo entra si es de esta sesión. Un PDF del gestor solo entra si ya está listo y no fue borrado. Una norma entra por su id. Esos filtros están en `evidence/qdrant-metadata.ts`. Los campos indexados son origen, expediente, sesión, hoja de vida, documento y página.

Después del cruce, `retrieve` hace tres limpiezas:

1. Mira si el trozo de verdad habla del dato (`evidenceFits`, en `graph/mentions.ts`).
2. Tira una nota de prensa que no nombra al candidato ni al hecho.
3. Pide al modelo de decisión que deje solo los trozos pertinentes, sin perder un medio de prueba que ya encajaba (`coverOutlets`).

Otros archivos de esta misma carpeta, en simple:

| Archivo | Qué resuelve |
| --- | --- |
| `outlets.ts` | Qué dominios son noticia, cuáles son de confianza y cuáles son redes. |
| `press-fallback.ts` | Qué hacer si la búsqueda web no trae el cuerpo de la nota. |
| `statutes.ts` | Qué norma citar cuando la pregunta es de regla (Constitución, códigos), no de la vida del candidato. |
| `attribution.ts` | Si la frase de la imagen de verdad aparece en el plan o en la hoja. |
| `jne-search.service.ts` | Cómo leer el padrón. Si hay `JNE_API_BASE_URL`, por HTTP. Si no, por Postgres. |

El worker es quien llena Qdrant. `apps/worker/src/ingest.service.ts` escucha la cola `tumi-jobs`:

- **Indexar planes.** Va por lotes y puede retomarse. Si un expediente ya está, lo salta. No arranca solo, salvo que `INDEX_PLANS_ON_START=true`. A mano: `node apps/worker/dist/index-plans.js`.
- **Indexar un PDF** subido por el gestor.
- **Cada hora**, borrar visitas y documentos viejos.

El worker hace una cosa a la vez (`concurrency: 1`). Así un PDF y un lote de planes no se pisan.

## 9. La respuesta llega mientras se piensa

La persona ve el avance. No espera en blanco hasta el final.

El API escribe **eventos** (server-sent events). Cada evento tiene un nombre: `node` (entró o salió de una estación), `decision` (salió un veredicto), `token` (llegó un pedazo de la explicación), `result` (el paquete final) o `error`.

Las estaciones no saben nada de HTTP. Avisan por tres funciones: `onNode`, `onDecision`, `onToken`. El controlador las traduce a líneas `event:` y `data:`.

En la página, `ApiService` (`apps/web/src/app/api.service.ts`) lee ese chorro. `VerifyCandidate` va pintando las estaciones, el borrador de la explicación y, al final, el resultado. El estado de la pantalla usa **signals** de Angular: cajitas (`query`, `busy`, `nodes`, `draft`, `result`) que la vista lee solas cuando cambian.

El cuerpo de la petición puede pesar hasta 8 MB, para que quepa una imagen en base64 (`apps/api/src/main.ts`). Todas las rutas del API empiezan por `api`.

## 10. Dos formas de entrar: la persona y el gestor

No es el mismo login.

**La persona no tiene cuenta.** El navegador guarda dos identificadores en `localStorage`: el id de la visita (`tumi.session`) y una llave (`tumi.sessionKey`). Los manda en la cabecera `X-Session-Key`.

El servidor no guarda la llave. Guarda su huella SHA-256. Para comparar usa `timingSafeEqual`, que tarda lo mismo si acierta o si falla. Así no se puede adivinar la llave midiendo el tiempo de la respuesta.

```18:32:apps/api/src/shared/session/session-access.ts
export async function openSession(sessionId: string | undefined, accessKey: string | undefined): Promise<string> {
  const key = requireKey(accessKey);
  const id = sessionId && UUID.test(sessionId) ? sessionId : randomUUID();
  const prisma = getPrisma();
  const hash = hashAccessKey(key);
  await prisma.factSession.upsert({
    where: { id },
    create: { id, accessKeyHash: hash },
    update: {},
  });
  const row = await prisma.factSession.findUnique({ where: { id } });
  if (!row?.accessKeyHash || !accessKeysMatch(row.accessKeyHash, key)) {
    throw new UnauthorizedException("La sesión no corresponde a esta llave");
  }
  return id;
}
```

La llave tiene que tener al menos 16 caracteres. El id tiene que parecer un UUID. Si alguien presenta el id de otra visita, la huella no coincide y se rechaza. El historial usa la variante de solo lectura, `readSession`. Si la página recibe un 401, borra la llave local y muestra el historial vacío.

Hay un `AuthGuard` registrado para todas las rutas, pero hoy deja pasar siempre (`canActivate` devuelve `true`). La variable `AUTH_ENABLED` está en Docker y este guard todavía no la lee. Lo que de verdad cierra la visita es la llave, no ese guard.

**El gestor sí tiene cuenta.** Correo, nombre y contraseña hasheada. Su sesión es una cookie con un token, y en la base solo se guarda la huella del token, con fecha de vencimiento. `GestorGuard` exige esa sesión para subir o borrar PDFs. El login está en `gestor-auth.controller.ts`. Los documentos, en `gestor-documents.controller.ts`.

## 11. Los PDFs y lo que se borra con el tiempo

El gestor sube un PDF atado a un candidato. Si pesa más de 15 MB (`DOCUMENT_MAX_BYTES`), se rechaza. Queda en estado `pending`. El worker lo parte, lo indexa en Qdrant como `documento` y lo pasa a `ready`.

Borrar no desaparece la fila al instante. Marca `deletedAt` y pide a Qdrant que quite los trozos de ese documento.

Hay dos plazos, en `packages/database/src/retention-policy.ts`:

- Las visitas duran 30 días (`CONSULTA_RETENTION_DAYS`).
- Los documentos duran 365 días (`DOCUMENT_RETENTION_DAYS`).

Si un documento se retira y un turno viejo lo citaba, el texto de esa cita se marca con «Documento retirado por la política de conservación.» No se borra el veredicto. Tampoco se deja la cita como si la fuente siguiera en pie.

Los archivos viven en el volumen Docker `documents`, montado en `/data/documents` para el API y para el worker.

## 12. La página

Angular 22. Cada pantalla es un componente independiente. No hay módulos viejos de Angular para la funcionalidad. El estado se lee con signals.

| Pantalla | Qué hace |
| --- | --- |
| Inicio | Departamento, provincia y distrito en cascada. Recuerda el distrito en el navegador. Agrupa candidatos por cargo, en un orden fijo. |
| Búsqueda | Filtros del contrato: organización, sexo, estudios, trabajo, si tuvo cargo antes, si no tiene sentencias, y el orden. |
| Ficha | Solo lectura. Tres pestañas: hoja, plan y verificar. Dentro de verificar va el componente de la pregunta. |
| Verificar | Una pregunta, o una imagen pegada o elegida. Muestra el avance, el veredicto, la seguridad, las citas de prueba y, aparte, el contraste. Los textos están en `labels.ts`. El markdown de la explicación se convierte a HTML en `markdown.ts`. |
| Historial | La lista de turnos de esta visita. |
| Gestor | Entrar y subir PDFs. |

El componente de la pregunta no decide si algo es verdadero. Pregunta al API y traduce la respuesta a frases en español.

## 13. Guías que se usaron al programar (skills)

Las **skills** son guías para quien escribe el código. No corren cuando una persona usa TUMI. Viven en `.claude/skills`. Dijeron cómo armar el grafo, la búsqueda y el API. Una de ellas, la del veredicto, sí quedó casi copiada en las reglas del programa.

| Guía | Qué pedía, en simple | Dónde se ve |
| --- | --- | --- |
| `verify-claim` | Una oración, un veredicto. Si niegan un cargo, busca el hecho positivo. Si un medio de prueba afirma el hecho, esa nota sigue siendo prueba. La búsqueda web de OpenAI no reemplaza estas reglas. | `profile/rules.ts`, `graph/mentions.ts`, `evidence/outlets.ts` y el texto largo de `judgeClaim`. |
| `langgraph-fundamentals` | Dibuja el flujo como estaciones con una mochila de estado, y compila el grafo antes de usarlo. | `fact-check.graph.ts`, `state.ts`, `nodes.ts`. |
| `langgraph-persistence` | Guarda el recorrido. En producción, Postgres. La memoria del proceso solo sirve de respaldo. Cada visita tiene su hilo (`thread_id`). | `openCheckpointer`. Esquema `langgraph`. |
| `langgraph-decision-models` | Lo que es una decisión (sí/no, elegir, poner nota) no se le pide a un modelo que escribe párrafos. Devuelve probabilidades. El umbral lo pone el programa. | `DecisionsService`. La guía habla de un clasificador llamado Jev. Aquí el transporte es la Decisions API de OpenAI (`gpt-6-luna`), con los mismos tres tipos de pregunta. El umbral está en `resolveVerdict`, fuera del modelo. |
| `langgraph-typescript-quickstart` | El grafo va en TypeScript, no en un servicio Python aparte. | Dependencias de `apps/api/package.json`. |
| `qdrant-clients-sdk` | Usar el cliente oficial de Qdrant para JavaScript. | `VectorSearchService` y `apps/worker/src/qdrant-store.ts`. |
| `qdrant-search-quality` | Juntar búsqueda por palabras y por significado. Reordenar después. Filtrar antes de comparar. No tocar la configuración de Qdrant antes de mirar el modelo de embeddings y cómo se cortan los párrafos. | El cruce Postgres + Qdrant, el rerank con mínimo 0.4, los filtros y los topes de 12 y de 8. |
| `nestjs-best-practices` | Un módulo, dependencias inyectadas, validar en la puerta, controladores flacos. | `AppModule`, handlers, Zod en el controlador, guards. |
| `angular-developer` | Usar la versión de Angular del proyecto, signals y componentes sueltos. | `apps/web`, Angular 22.2. |
| `design-taste-frontend`, `web-design-guidelines`, `modern-web-guidance` | La página tiene que verse decidida, no como una plantilla genérica, y hay que cuidar accesibilidad y comportamiento. | `apps/web/src/app` y `styles.scss`. |
| Regla `english-code` | Inglés en el código. Español en lo que lee la persona y en los valores ya guardados. | `VerifyClaimHandler` frente al mensaje «Elige un candidato antes de verificar». |

La primera frase de la guía `verify-claim` dice: la oración de la persona recibe un veredicto. Las frases que se extraen sirven para buscar y para explicar. No reemplazan la oración. `claimsToJudge` es esa frase convertida en función.

## 14. Formas de organizar el código (patrones)

No hay una carpeta llamada `patrones`. Las formas están en cómo quedaron las carpetas y las funciones. Abajo, primero la idea y después el nombre que se usa en ingeniería.

**Cada función en su carpeta, de arriba a abajo.** Verificar, buscar y ver el historial no comparten un cajón de «servicios». (*Vertical slice* y *screaming architecture*. Secciones 3 y 4.)

**Escribir por un lado, leer por el otro.** (*CQRS*. Sección 4.)

**Una fila de estaciones.** El grafo siempre hace los seis pasos en el mismo orden. La mochila de estado es lo que pasa de una a otra. (*Pipeline*.)

**La estación pide, no sabe quién responde.** `AgentDeps` es la lista de lo que el grafo necesita. OpenAI, Qdrant, Tavily y el padrón son los enchufes. Cambiar la prensa no obliga a reescribir `nodes.ts`. El padrón, además, elige HTTP o Postgres según haya o no `JNE_API_BASE_URL`. (*Ports and adapters*. En castellano: puertos y adaptadores.)

**Varias maneras de resolver, y se elige una.** Según el tipo de pregunta cambian las búsquedas. Según el caso, se responde con una regla fija, con «¿lo dijo?» más el grafo, o solo con el grafo. (*Strategy*. Estrategia.)

**Preguntas de sí o no, fáciles de probar.** ¿Es un veredicto válido? ¿El trozo habla del dato? ¿La frase aparece en el plan? ¿Es una red social? ¿Está pidiendo otro cargo? Esas funciones no necesitan Nest ni una base para probarse. (*Specification*. Especificaciones.)

**El modelo propone y el programa dispone.** El modelo dice «verdadero» con una seguridad. Si esa seguridad es baja, o si se niega a contestar, el programa publica «no se puede comprobar». Lo mismo al reordenar trozos: bajo 0.4 no pasan. (*Policy*. Política.)

**Una función arma el grafo.** `buildGraph` lo construye y lo deja listo. Se llama al arrancar y otra vez cuando el candidato ya está fijado, porque los enchufes cambian. (*Factory*. Fábrica.)

**Una copia del recorrido.** El checkpointer guarda el estado del grafo por visita. Sirve para no perder el paso. El historial que ve la persona es otra cosa: son los turnos de `fact_turns`. (*Memento*.)

**Avisar sin saber quién escucha.** Las estaciones llaman `onToken` y no saben que eso se vuelve un evento HTTP. (*Observer*. Observador.)

**Portero en la puerta.** `RateLimitGuard` cuenta los POST por IP en Redis: 30 por minuto. Salud y lo que no es POST pasan. `GestorGuard` exige la sesión del gestor. (*Guard*.)

**Si falta una pieza, se dice.** Sin clave de OpenAI, o con la memoria del grafo caída, la respuesta lo marca (`degraded`). No se finge un veredicto. (*Degradación explícita*.)

**Traducir en la frontera.** La página no ve filas de Prisma ni el JSON interno de Qdrant. Ve `SourceRef`. Al revés, `qdrant-metadata.ts` traduce «el plan de este expediente» al filtro que Qdrant entiende. (*Capa anticorrupción*: un modelo no se cuela en el otro.)

**La lectura del padrón no está en el controlador.** `search-candidates/scope.ts` arma el recorte geográfico. Tiene su propia prueba. No hay una clase con el nombre Repository, pero el efecto es el mismo: el controlador no escribe el `where`.

**El trabajo pesado va a una cola.** Indexar PDFs y recorrer planes no se hacen dentro del pedido de la persona. API y worker comparten la cola `tumi-jobs`. (*Cola*, o *load leveling*: no dejar que un pico tumbe la consulta.)

**Retomar sin repetir.** Indexar planes avanza con un cursor. Lo ya indexado se omite. El trabajo se vuelve a encolar solo mientras queden lotes.

**Ante la duda, cerrar.** Si la llave es corta, el id no es un UUID o la huella no coincide, no hay historial. (El límite de consultas es al revés: si Redis no contesta, deja pasar. La sesión no.)

## 15. Cualidades que el sistema cuida

En ingeniería de software estas cualidades se llaman **atributos de calidad**. La lista de abajo sigue el esquema ISO/IEC 25010, pero cada punto dice qué se ve en este repositorio. No hay un documento de requisitos aparte. El mecanismo es el requisito.

### Hace lo que tiene que hacer (idoneidad)

- Solo cuatro veredictos. Otro valor no pasa el esquema.
- Se juzga con pruebas, no con lo que circula en redes.
- Si la hoja o el plan ya responden, hay una regla fija y no se llama al modelo.
- Una imagen puede ser «léeme este dato» o «esta frase, ¿la dijo y es cierta?».
- Si no hay clasificador, lo dice. No inventa seguridad.

Esas reglas se contrastan con casos a mano en `evaluation/cases.ts` (por ejemplo trayectoria, negación absoluta, causa incorrecta). Cada caso trae persona, id de hoja, frase, etiqueta esperada, veredictos aceptados, criterio y un enlace de referencia. La corrida real es `pnpm --filter @tumi/api eval:cases`. No forma parte de `pnpm test`, porque llama a servicios de fuera.

### No hace trabajar de más (eficiencia)

- La explicación llega por pedazos. La pantalla no espera el JSON final para mostrar algo.
- Reordenar mira como máximo 20 trozos y se queda con 8. La búsqueda corta en 12 antes.
- Las búsquedas de prensa de un ministerio van topeadas a 2.
- El worker hace un trabajo a la vez.
- 30 envíos POST por IP cada 60 segundos.
- Hacia internet solo se publica la página.

### Sigue en pie cuando algo falla (fiabilidad)

- Sin clave, o sin Postgres para el checkpointer, hay una respuesta marcada, no un crash silencioso.
- Docker pregunta `GET /api/health` para saber si el API despertó. Le da 30 segundos de gracia.
- Redis guarda en disco (AOF) y responde a un ping.
- Si un trabajo de la cola falla, queda en el log.
- El barrido de retención, si falla, se anota y el proceso sigue.
- Repetir la misma visita no crea dos filas (`upsert`).

### Cuida los datos (seguridad)

- La llave de la visita no se guarda en claro.
- Sin esa llave no se lee el historial de esa visita.
- El gestor entra con contraseña hasheada y un token que también se guarda hasheado.
- El JSON de entrada llega hasta 8 MB. La imagen del dato, hasta 4 MB y solo JPG, PNG o WebP. El PDF, hasta 15 MB.
- Un plan de otro expediente, o el PDF de otro candidato, no entra en la búsqueda. Lo impide el filtro.
- `AuthGuard` no aplica `AUTH_ENABLED`. En la tesis, el acceso de la persona es la llave de la visita, no un usuario y contraseña.

### Se puede cambiar sin romper todo (mantenibilidad)

- Un caso de uso, una carpeta, una prueba al lado. Hay pruebas de reglas, del grafo, de menciones, de medios, de atribución, de filtros Qdrant, de normas, de casos, de sesión, de retención, del recorte geográfico, de la prensa de respaldo, de la imagen y de la clave del gestor.
- Si se cambia un veredicto en `verdict-policy.ts`, página y API dejan de compilar hasta ponerse de acuerdo.
- Las estaciones se prueban enchufando funciones falsas. No hace falta OpenAI para eso.
- Inglés en los nombres del código. Español estable en lo que ya está en la base y en la pantalla.

### Encaja con lo que ya existía (compatibilidad)

- El mismo contrato TypeScript en la página y en el API.
- Dos nombres de ruta para comprobar una afirmación, una sola implementación.
- Prisma usa los nombres de columna que tumi2 ya tenía (`hoja_vida_id`, `codigo_expediente`). No se renombra el padrón.
- Qdrant y Postgres viven fuera de este Compose. Este proyecto no se adueña de esos datos.

### Se puede mover de máquina (portabilidad)

- `docker-compose.yml` y los Dockerfiles en `docker/`.
- En Dokploy se publica solo `web`, en el puerto 80, con la red `dokploy-network`. No se fija `container_name`.
- Las variables están en `README.md` y en `.env.example`.

### Se puede reconstruir por qué dijo eso (trazabilidad)

Es la cualidad que la tesis tiene que poder defender. Un turno guarda:

- El veredicto y la seguridad, en columnas.
- El paquete completo en `sources`: pregunta, conclusión, veredictos, fuentes (papel, origen, URL, página, expediente) y candidato.
- En `choices`, lo que contestó el modelo: si la evidencia apoya, si contradice, qué veredicto propuso y qué tan sólida la vio.
- La marca de degradado cuando el sistema se negó a juzgar.

Con una fila de `fact_turns` se puede explicar por qué salió «engañoso» o «no se puede comprobar» sin volver a llamar al modelo. El checkpointer de LangGraph es otra huella: la del recorrido interno, en el esquema `langgraph`. El historial de la persona es el turno.

### Límites de uso

- La persona escribe el dato o pega una imagen. La visita caduca a los 30 días.
- La pantalla habla de verificación. No de nota oficial.
- El modo degradado no inventa un porcentaje.
- Si un PDF se retira, la cita vieja queda marcada como retirada.

## 16. Qué tablas escribe esta aplicación

El dibujo está en `packages/database/prisma/schema.prisma`, esquema `tumi`.

| Tabla | En simple |
| --- | --- |
| Organizaciones, listas, candidatos, hoja de vida (trabajo, estudios, cargos, renuncias, ingresos, inmuebles, vehículos, sentencias) | El padrón. Esta aplicación lo lee. |
| Plan, dimensiones y propuestas | El plan de gobierno. También se busca por palabras. |
| Departamentos, provincias, distritos | El mapa de la portada. |
| `fact_sessions` | La visita: id y huella de la llave. |
| `fact_turns` | Cada resultado: papel, texto, veredicto, seguridad, `sources` y `choices`. |
| `gestors`, `gestor_sessions` | Quién puede subir PDFs, y su sesión. |
| `candidate_documents` | El PDF, su estado, cuántas páginas tiene y si fue borrado. |

Hay dos SQL de apoyo por si el esquema de tumi2 todavía no tiene las tablas nuevas: `packages/database/prisma/tumi-gestors.sql` y `tumi-session-documents.sql`.

## 17. Cómo se prueba

`pnpm test` compila y corre `node --test`. No es Jest.

Qué cubren las pruebas, en intención:

- El umbral del veredicto.
- El grafo con funciones falsas, para no llamar a internet.
- Si un texto menciona al candidato y si un trozo encaja con el dato.
- Las reglas de la ficha (otro cargo, negación, juicio de valor).
- Medios, prensa de respaldo, atribución, normas y filtros de Qdrant.
- El recorte geográfico, la sesión, la clave del gestor y la retención.
- Que el banco de casos esté bien formado.

La corrida contra el sistema de verdad (`eval:cases`) es aparte, porque gasta llamadas externas.

## 18. Una comprobación, de principio a fin

1. La persona abre `/candidatos/:id`. La página pide `GET /api/candidates/:id`.
2. Escribe un dato o pega una imagen. La pantalla llama a `POST /api/fact-check/stream` con el candidato, el id de visita y la llave.
3. Zod revisa la forma. `openSession` crea la visita o comprueba que la llave es de esa visita.
4. Se carga la ficha. Según el caso: se lee la imagen, se aplica una regla fija, o se entra al grafo.
5. Si hay grafo: se fija la persona, se sacan las frases, se arman búsquedas, se junta evidencia, se reordena, el modelo propone un veredicto, el programa aplica el 0.55 y el redactor explica en vivo.
6. Se inserta el turno.
7. Llega el evento `result`. La pantalla muestra el veredicto, las pruebas y, aparte, el contraste.
8. `GET /api/history?sessionId=` devuelve ese turno si la llave coincide.

## 19. Qué falta cerrar

- `AuthGuard` deja pasar siempre. No mira `AUTH_ENABLED`.
- Si el checkpointer quedó en memoria, un reinicio olvida el recorrido interno. Los turnos ya guardados en `fact_turns` no se pierden por eso.
- No se va a añadir event sourcing. La huella es el turno y, si Postgres respondió al arrancar, el checkpoint.

## 20. Dónde citar cada cosa

| Si la tesis habla de… | Abre este archivo |
| --- | --- |
| Cómo se registran los casos de uso | `apps/api/src/app.module.ts` |
| La fila de estaciones | `apps/api/src/commands/verify-claim/graph/fact-check.graph.ts` |
| La mochila de estado y los enchufes | `apps/api/src/commands/verify-claim/graph/state.ts` |
| Lo que hace cada estación | `apps/api/src/commands/verify-claim/graph/nodes.ts` |
| Reglas fijas, guardado del turno y memoria del grafo | `apps/api/src/commands/verify-claim/verify-claim.handler.ts` |
| El modelo que decide | `apps/api/src/commands/verify-claim/decisions/decisions.service.ts` |
| El modelo que redacta y lee imágenes | `apps/api/src/commands/verify-claim/drafting/llm.service.ts` |
| Reglas sin modelo | `apps/api/src/commands/verify-claim/profile/rules.ts` |
| Búsqueda por palabras y por significado | `apps/api/src/commands/verify-claim/evidence/vector-search.service.ts` |
| Filtros de Qdrant | `apps/api/src/commands/verify-claim/evidence/qdrant-metadata.ts` |
| Medios que cuentan como prueba | `apps/api/src/commands/verify-claim/evidence/outlets.ts` |
| El 0.55 y los tipos | `packages/contracts/src/verdict-policy.ts` |
| La validación de lo que entra | `packages/contracts/src/index.ts` |
| La cola de trabajos | `apps/worker/src/ingest.service.ts` |
| El historial que solo lee | `apps/api/src/queries/consult-history/consult-history.handler.ts` |
| La llave de la visita | `apps/api/src/shared/session/session-access.ts` |
| El límite de consultas | `apps/api/src/shared/rate-limit/rate-limit.guard.ts` |
| Las tablas | `packages/database/prisma/schema.prisma` |
| Lo que caduca | `packages/database/src/retention-policy.ts` |
| Los casos de prueba de la tesis | `apps/api/src/commands/verify-claim/evaluation/cases.ts` |
| La guía del veredicto | `.claude/skills/verify-claim/SKILL.md` |
| El resumen corto del proyecto | `README.md`, sección «Ruta de tesis» |
