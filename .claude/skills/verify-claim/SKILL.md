---
name: verify-claim
description: Rules for TUMI claim verification. Use when changing verdicts, press search, evidence roles, or the judge in apps/api/src/commands/verify-claim.
---

# Verify a claim

The citizen's sentence gets one verdict. Extracted clauses search and explain. They do not replace the sentence.

The agent plans the searches, chooses the verdict, and writes the explanation. The code keeps a short policy. It does not script a case.

## The fact to check is not the person's title

An agent names the fact being contrasted. A profession word only identifies the person when the sentence asserts something else. `contrastTarget` removes a leading title (`El abogado …`) so that word cannot match the education row by itself.

A sentence that is itself about the degree or the job still uses that row as evidence. The hoja does not close the verdict or write the citizen's sentence.

## The agent plans the search

`planQueries` returns up to three queries and at most two statute ids from the catalog. Each query includes the person's name and looks for the fact. If the sentence denies a fact, the plan also searches the positive fact. If it claims another office, the plan searches that office. An id outside the catalog is dropped.

If the model returns no queries, the only backup is the short name plus the fact to contrast. Do not add a phrase for a particular case.

## A statute explains the rule

A statute is reference for the explanation. It says what the law allows or requires, and it does not prove that this person did the act. `statuteQuery` uses the statute the agent chose, not the person's name. Those chunks use role `referencia`. The judge only sees role `prueba`.

## One sentence, one verdict

If the query is a single sentence, judge that sentence. Do not score the first true clause.

The judge and the explainer share `CLAIM_POLICY`: use only the attached sources, a proof outlet that publishes the fact counts, the hoja and the padrón count only for what they declare, a statute does not prove the act, a complaint is not a conviction, and a value judgment without an indicator, a threshold, and a period is `no_verificable`.

## A proof outlet that states the fact stays proof

`evidenceFits` keeps a content word of three or four letters when it is not filler and not a bare verb. Do not send that note to contraste.

Proof outlets are RPP, El Comercio, La República, Agencia Andina, OjoPúblico, Convoca, IDL-Reporteros, PerúCheck, and IPE. OpenAI web search only supplies a cited sentence and a URL. It does not supply the article body, and an OpenAI shell skill does not replace these rules.
