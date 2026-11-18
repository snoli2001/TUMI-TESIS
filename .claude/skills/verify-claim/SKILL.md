---
name: verify-claim
description: Rules for TUMI claim verification. Use when changing verdicts, press search, evidence roles, or the judge in apps/api/src/commands/verify-claim.
---

# Verify a claim

The citizen's sentence gets one verdict. Extracted clauses search and explain. They do not replace the sentence.

## The fact to check is not the person's title

Before a hoja rule closes the sentence, an agent names the fact being contrasted. A profession word only identifies the person when the sentence asserts something else, such as a sanction, a resignation, an office, a promise, or a crime. `contrastTarget` removes a leading title (`El abogado …`) so that word cannot close the case on the education row.

A sentence that is itself about the degree or the job still uses that row.

## Source search always runs

A hoja rule does not skip the press. `fromRule` still searches trusted outlets for the contrast target and keeps a note that names the candidate or states the fact. The graph path searches as well. The explainer may cite a outlet only when that note is in the source list.

## One sentence, one verdict

If the query is a single sentence, judge that sentence. Do not score the first true clause.

A wrong government, a promise treated as delivery, or a civil union called equal marriage makes the sentence false. A date missing from an excerpt does not, when a proof outlet already confirmed the act.

## A denial searches the positive fact

`nunca ocupó` or `nunca fue` plus a ministry searches `{name} fue ministro`, and that query stays inside the two-query cap. If a proof outlet publishes the appointment, the denial is `falso`. Silence in the hoja de vida is not that denial.

## A proof outlet that states the fact stays proof

`evidenceFits` keeps a content word of three or four letters when it is not filler and not a bare verb. `gay` in a headline counts. Do not send that note to contraste.

Proof outlets are RPP, El Comercio, La República, Agencia Andina, OjoPúblico, Convoca, IDL-Reporteros, PerúCheck, and IPE. OpenAI web search only supplies a cited sentence and a URL. It does not supply the article body, and an OpenAI shell skill does not replace these rules.
