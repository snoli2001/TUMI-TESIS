export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export function originalPdfName(value: string | undefined): string {
  const base = (value ?? "documento.pdf").split(/[/\\]/).pop()?.trim() || "documento.pdf";
  const clean = base.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/g, "").slice(0, 180);
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
}
