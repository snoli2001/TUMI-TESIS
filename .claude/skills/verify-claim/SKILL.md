---
name: verify-claim
description: Rules for TUMI claim verification. Use when changing verdicts, press search, evidence roles, or the judge in apps/api/src/commands/verify-claim.
---

# Verify a claim

The citizen's sentence gets one verdict. Extracted clauses search and explain. They do not replace the sentence.

The agent plans the searches, chooses the verdict, and writes the explanation. The code keeps a short policy. It does not script a case.

## The fact to check is not the person's title

`focus` is the fact being contrasted. It is stored on the graph and on the result. Search, ranking, the judge, and the explanation use that fact. A profession word only identifies the person when the sentence asserts something else. `contrastTarget` removes a leading title (`El abogado …`) so that word cannot match the education row by itself.

The citizen still sees the original sentence as the claim. The screen shows `focus` as «Dato contrastado» when it differs from that sentence.

A sentence that is itself about the degree or the job still uses that row as evidence. The hoja does not close the verdict or write the citizen's sentence.

## One agent names the fact, another writes the press query

`focusContrast` names the fact. `pressQueries` then writes at most two search strings for that fact. Those strings go to Tavily as written, and to OpenAI web search only if Tavily is unavailable. The code already sets Peru, advanced depth, and the domains, so the query does not contain `site:`, an outlet name, or instructions. Each query is one short search: the name plus the distinctive fact, including the quantity, date, or office when the fact has them. A profession word stays out when the fact asserts something else. If the fact denies an event, the second query searches the positive event. The token query is used only when this agent returns nothing. A note counts as proof only when it states the fact. Naming the person is not enough. The hoja contributes a row only when that row states the fact. The judge receives the fact and the statute reference. The turn stores the press query, the state query, and the recovered URLs.

State pages are searched one portal at a time, and only the portal that fits the fact: the judiciary for a sentence, the electoral jury for a vacancy.

`planQueries` does not write the press query. It returns up to two state-portal queries, at most two statute ids, and a legal query. `stateQueries` is empty unless the fact is about a sentence, a case, a vacancy, a resolution, an administrative sanction, or a public office or contract. An id outside the catalog is dropped.

## A statute explains the rule

A statute is reference. It says what the law allows or requires, and it does not prove that this person did the act. `legalQuery` is an abstract legal question without the person's name. `statuteQuery` is the backup. Those chunks use role `referencia` and reach the judge as `referenciaNormativa`, separate from proof. The verdict sources stay role `prueba`. A state document is proof of what that document records.

## One sentence, one verdict

If the query is a single sentence, judge that sentence. Do not score the first true clause.

The judge and the explainer share `CLAIM_POLICY`: use only the attached sources, a proof outlet that publishes the fact counts, the hoja and the padrón count only for what they declare, a statute does not prove the act, a complaint is not a conviction, and a value judgment without an indicator, a threshold, and a period is `no_verificable`.

## A proof outlet that states the fact stays proof

`evidenceFits` and `mentionsClaim` match a stem of five letters, so `suspendido` meets `suspenden`. They compare the note with `focus`, so a note that only shares a title word does not stay. Do not send a note that states the fact to contraste.

Proof outlets are RPP, El Comercio, La República, Agencia Andina, OjoPúblico, Convoca, IDL-Reporteros, PerúCheck, and IPE. OpenAI web search only supplies a cited sentence and a URL. It does not supply the article body, and an OpenAI shell skill does not replace these rules.
