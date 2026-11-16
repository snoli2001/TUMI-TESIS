---
name: verify-claim
description: Rules for TUMI claim verification. Use when changing verdicts, press search, evidence roles, or the judge in apps/api/src/commands/verify-claim.
---

# Verify a claim

The citizen's sentence gets one verdict. Extracted clauses search and explain. They do not replace the sentence.

## One sentence, one verdict

If the query is a single sentence, judge that sentence. Do not score the first true clause.

A wrong government, a promise treated as delivery, or a civil union called equal marriage makes the sentence false. A date missing from an excerpt does not, when a proof outlet already confirmed the act.

## A denial searches the positive fact

`nunca ocupó` or `nunca fue` plus a ministry searches `{name} fue ministro`, and that query stays inside the two-query cap. If a proof outlet publishes the appointment, the denial is `falso`. Silence in the hoja de vida is not that denial.

## A proof outlet that states the fact stays proof

`evidenceFits` keeps a content word of three or four letters when it is not filler and not a bare verb. `gay` in a headline counts. Do not send that note to contraste.

Proof outlets are RPP, El Comercio, La República, Agencia Andina, OjoPúblico, Convoca, IDL-Reporteros, PerúCheck, and IPE. OpenAI web search only supplies a cited sentence and a URL. It does not supply the article body, and an OpenAI shell skill does not replace these rules.
