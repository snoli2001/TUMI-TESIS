export interface StatuteDocument {
  id: string;
  title: string;
  url: string;
  edition: string;
}

export const STATUTE_DOCUMENTS: StatuteDocument[] = [
  {
    id: "constitution",
    title: "Constitución",
    url: "https://www3.congreso.gob.pe/Docs/files/constitucion/constitucion-12-2024.pdf",
    edition: "Edición de diciembre de 2024",
  },
  {
    id: "electoral-compendium",
    title: "Compendio electoral",
    url: "https://www.jne.gob.pe/OC/2025/COMPENDIO_DE_LEGISLACION_ELECTORAL_2026.pdf",
    edition: "Compendio electoral 2026",
  },
  {
    id: "municipal-law",
    title: "Ley de municipalidades",
    url: "https://www.jne.gob.pe/oc/2025/Compendio-de-Legislacion-Electoral/14-Ley-Organica-Municipalidades-Ley-N27972.pdf",
    edition: "Ley 27972, actualización de marzo de 2025",
  },
  {
    id: "criminal-procedure",
    title: "Código Procesal Penal",
    url: "https://cdn.www.gob.pe/uploads/document/file/7451652/6346160-codigo-procesal-penal-decreto-legislativo-final.pdf?v=1735935872",
    edition: "Octava edición oficial, diciembre de 2024",
  },
  {
    id: "executive-law",
    title: "Ley del Poder Ejecutivo",
    url: "https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=6",
    edition: "Texto consultado al 11/10/2023",
  },
  {
    id: "criminal-code",
    title: "Código Penal",
    url: "https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=2",
    edition: "El Peruano",
  },
  {
    id: "civil-code",
    title: "Código Civil",
    url: "https://cdn.www.gob.pe/uploads/document/file/3621140/C%C3%93DIGO%20CIVIL.pdf.pdf?v=1663014332",
    edition: "Edición de gob.pe; puede tener cambios posteriores",
  },
  {
    id: "transparency-law",
    title: "Ley de transparencia",
    url: "https://cdn.www.gob.pe/uploads/document/file/2017101/Ley27806.pdf",
    edition: "TUO de 2019; puede tener cambios posteriores",
  },
];
