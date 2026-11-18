import assert from "node:assert/strict";
import test from "node:test";
import { needsPressFallback, pressItems } from "./press-fallback";

const andina = "https://andina.pe/agencia/noticia-jefe-estado-acepta-renuncia-francis-allison-al-cargo-ministro-vivienda-256005.aspx";

test("sin resultados y con Tavily caído se usa el respaldo", () => {
  assert.equal(needsPressFallback(0, true), true);
  assert.equal(needsPressFallback(0, false), false);
  assert.equal(needsPressFallback(2, true), false);
});

test("una cita de Andina entra y el texto sin URL no", () => {
  const text = "El modelo inventa un cargo.\nEl jefe de Estado aceptó la renuncia de Francis Allison al Ministerio de Vivienda. Andina";
  const start = text.lastIndexOf("Andina");
  const items = pressItems([
    {
      type: "web_search_call",
      action: { type: "search", sources: [{ type: "url", url: "https://ejemplo.com/nota" }] },
    },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text,
          annotations: [
            { type: "url_citation", url: andina, title: "Jefe de Estado acepta renuncia", start_index: start, end_index: start + "Andina".length },
            { type: "url_citation", url: "https://ejemplo.com/nota", title: "Otra página", start_index: 0, end_index: 20 },
          ],
        },
      ],
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, andina);
  assert.equal(items[0]?.origin, "tavily");
  assert.equal(items[0]?.role, "prueba");
  assert.match(items[0]?.snippet ?? "", /renuncia de Francis Allison/);
  assert.equal(items[0]?.snippet.includes("inventa un cargo"), false);
});

test("una página de tema y un no encontré no entran como prueba", () => {
  const text = "No encontré en las páginas consultadas una nota que diga que Francis Allison renunció. RPP";
  const start = text.lastIndexOf("RPP");
  assert.deepEqual(
    pressItems([
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text,
            annotations: [
              {
                type: "url_citation",
                url: "https://rpp.pe/noticias/francis-allison?utm_source=openai",
                title: "Noticias de Francis Allison",
                start_index: start,
                end_index: start + 3,
              },
            ],
          },
        ],
      },
    ]),
    [],
  );
  const apology = "No encontré en las páginas consultadas una nota sobre la renuncia. Andina";
  const mark = apology.lastIndexOf("Andina");
  assert.deepEqual(
    pressItems([
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: apology,
            annotations: [
              { type: "url_citation", url: andina, title: "Andina", start_index: mark, end_index: mark + 6 },
            ],
          },
        ],
      },
    ]),
    [],
  );
});

test("un pdf del Poder Judicial entra como prueba", () => {
  const url = "https://www.pj.gob.pe/resoluciones/sentencia.pdf";
  const text = "La sala confirmó la suspensión del ejercicio profesional por tres meses. PJ";
  const start = text.lastIndexOf("PJ");
  const items = pressItems([
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text,
          annotations: [
            { type: "url_citation", url, title: "Resolución", start_index: start, end_index: start + 2 },
          ],
        },
      ],
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, url);
  assert.equal(items[0]?.role, "prueba");
});

test("una URL de la búsqueda sin cita no entra", () => {
  assert.deepEqual(
    pressItems([{ type: "web_search_call", action: { sources: [{ url: andina }] } }]),
    [],
  );
});
