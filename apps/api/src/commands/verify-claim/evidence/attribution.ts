import { tokens } from "../../../shared/text";

const SPEECH = new Set([
  "dijo",
  "dice",
  "decir",
  "senalo",
  "afirmo",
  "declaro",
  "indico",
  "comento",
  "escribio",
  "publico",
  "segun",
  "candidato",
]);

export function statementAppears(
  statement: string,
  text: string,
  identity: { name: string; party?: string },
): boolean {
  const page = fold(text);
  const quote = fold(statement).replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  if (quote.length >= 12 && page.includes(quote)) return true;
  const opening = quote.slice(0, 180);
  if (opening.length >= 24 && page.includes(opening)) return true;
  const words = contentWords(statement, identity);
  if (words.length === 0) return false;
  const hits = words.filter((word) => page.includes(word));
  if (words.length === 1) return hits.length === 1 && words[0].length >= 6;
  const needed = Math.min(words.length, Math.max(2, Math.ceil(words.length * 0.6)));
  return hits.length >= needed;
}

export function accountIsCandidate(title: string, name: string): boolean {
  const nameTokens = signals(name);
  if (nameTokens.length === 0) return false;
  const folded = fold(title);
  const present = nameTokens.filter((token) => folded.includes(token));
  if (nameTokens.length === 1) return present.length === 1;
  return present.length >= 2;
}

export function socialPostCounts(
  title: string,
  pageText: string,
  statement: string,
  identity: { name: string; party?: string },
): boolean {
  return accountIsCandidate(title, identity.name) && statementAppears(statement, pageText, identity);
}

function contentWords(statement: string, identity: { name: string; party?: string }): string[] {
  const blocked = new Set([...signals(identity.name), ...signals(identity.party ?? ""), ...SPEECH]);
  return tokens(statement).filter((token) => token.length >= 4 && !blocked.has(token));
}

function signals(value: string): string[] {
  return tokens(value).filter((token) => token.length >= 3);
}

function fold(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}
