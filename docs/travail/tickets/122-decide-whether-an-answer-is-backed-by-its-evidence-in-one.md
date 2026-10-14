---
id: T122
titre: Decide whether an answer is backed by its evidence in one pure core function
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La règle qui dit si la réponse d'une question est acceptée (citations reliées aux preuves consultées,
sources web confirmées, réponse conversationnelle) tient aujourd'hui dans une ligne de près de 700
caractères au milieu de `DeepAsk.run`, et ne se teste qu'en faisant tourner une question entière. Après ce
ticket, elle est une fonction pure de `core/answer-validation.cjs`, fixée par une table de cas ;
`DeepAsk.run` l'appelle et garde la rédaction des refus. Les réponses rendues ne changent pas.

## Sources

- Constats : CORE-13
- Correction du relecteur sur CORE-13 : `run` lignes 77-158, ligne 133 de 697 caractères ; extraire la
  validation peut déplacer la tolérance de 1 ms ou l'ordre des cas `external`, `missingSources` et
  `conversational`.
- Code à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `core/deep-ask.cjs`, `DeepAsk.run`, `const citations = (result.citations || []).flatMap(…)`, lignes
    120-127 : écarte une citation aux bornes non finies ou vides ; la relie à une preuve de même `id` avec
    une tolérance de 1 ms de chaque côté ; la rogne aux bornes de cette preuve ; l'écarte si le rognage la
    vide.
  - `core/deep-ask.cjs`, `DeepAsk.run`, `job.validation = {…}`, ligne 128.
  - `core/deep-ask.cjs`, `DeepAsk.run`, `const external`, `const missingSources`, `const conversational`,
    lignes 130-132, puis `job.result = (…) ? {…} : {…}`, ligne 133 : réponse acceptée si
    (pas de sources manquantes, au moins une citation retenue et `kind` différent de `external`), ou
    `external` en mode `chat` avec des sources, ou conversationnelle (`insufficient` ou `explanation` en mode
    `chat`, sans sources manquantes) ; sinon refus, avec le texte « Je n’ai pas pu confirmer les sources… »
    quand `kind` vaut `external` ou que des sources manquent, et « Je n’ai pas pu relier cette réponse aux
    passages consultés. » sinon.
  - `core/deep-ask.cjs`, `plainAnswer`, ligne 7, et `DeepAsk.partial`, ligne 166 : utilisés pour bâtir le
    résultat, ils restent dans `core/deep-ask.cjs`.
- Tests existants : `tests/chat-sources.test.cjs` (dont « mislabeling a sourced claim as explanation does
  not bypass rejected-source validation »), `tests/question-ceiling.test.cjs`,
  `tests/evidence-refresh.test.cjs` (dont « the latest consulted version is the recorded evidence; its
  citation is accepted and metrics expose freshness »), les tests de questions aujourd'hui dans
  `tests/architecture-f04.test.cjs` (dont « what a finished question consulted still supports the
  citations of the next one… »).
- Fiche : `docs/travail/fiches/coeur.md`, étape 3 et invariant 5.

## Périmètre

- À modifier :
  - nouveau `core/answer-validation.cjs`, sans import : une fonction qui rend les citations retenues à
    partir des citations proposées et des preuves ; une fonction qui, à partir du résultat de l'agent, du
    mode de la question et des citations retenues, dit si la réponse est acceptée et, sinon, le motif du
    refus parmi deux (sources non confirmées, réponse non reliée aux passages). Aucun texte affiché dans ce
    fichier (arbitrage A6).
  - `core/deep-ask.cjs`, `DeepAsk.run` : les lignes 120-133 appellent ces deux fonctions ; `job.validation`,
    `job.result` et les deux textes de refus restent construits ici, à l'identique.
  - nouveau test plat `tests/answer-validation.test.cjs`.
- À ne pas toucher : l'assemblage des preuves (`observations`, `priorEvidence`, preuves de transcription et
  de mémoire, lignes 117-119) ; `needsInspection` (sa suppression appartient au lot L09) ; les minuteries
  de `run` (fiche, étape 11) ; les tests existants.
- Aucun `catch` vide ; lignes de 160 caractères au plus.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Citations : une citation dont les bornes ne sont pas finies, ou dont la fin ne dépasse pas le début,
   est écartée ; une citation d'un `id` absent des preuves est écartée ; une citation qui déborde d'une
   preuve d'1 ms au plus est retenue, rognée aux bornes de la preuve ; une citation qui déborde de plus
   d'1 ms est écartée ; une citation que le rognage vide (par exemple de la fin de la preuve à 1 ms
   après) est écartée ; quand deux preuves de même `id` conviennent, c'est la première dans l'ordre reçu
   qui sert au rognage (comme `evidence.find` aujourd'hui).
2. Verdict : une table couvre au moins ces cas, avec le résultat attendu observé sur le code d'aujourd'hui :
   réponse vidéo avec une citation retenue (acceptée) ; la même sans citation retenue (refus « passages ») ;
   `external` en mode `chat` avec des sources (acceptée) ; `external` sans source (refus « sources ») ;
   `external` avec des sources et une citation retenue hors mode `chat` (refus « sources ») ; `insufficient` et `explanation` en
   mode `chat` sans citation (acceptées) ; `explanation` en mode `chat` avec `sourceValidation.proposed > 0`
   et aucune source (refus « sources », la priorité des sources manquantes sur le conversationnel) ;
   `explanation` hors mode `chat` sans citation (refus « passages »).
3. `grep -n "const missingSources" core/deep-ask.cjs` ne rend rien ;
   `grep -n "[’éèêàçù]" core/answer-validation.cjs` ne rend rien (aucun texte affiché dans le module, ses
   commentaires restant en anglais) ; `grep -o "Je n’ai pas pu" core/deep-ask.cjs | wc -l` rend 2, comme
   à `0d5a954` (les deux refus restent rédigés là, au mot près).
4. Les fichiers de test cités dans les sources passent sans modification.
5. `node --test tests/answer-validation.test.cjs` passe ; `node scripts/check.mjs --changed` passe ;
   `tests/architecture.test.cjs` passe.
6. Mutation : remplacer temporairement la tolérance de 1 ms par 0 dans `core/answer-validation.cjs` fait
   échouer le critère 1 ; inverser la priorité entre sources manquantes et conversationnel fait échouer le
   critère 2. Les mutations sont retirées avant la fin et notées au journal avec le résultat observé.

## Test d'acceptation attendu

`tests/answer-validation.test.cjs`, test « a citation within a millisecond of its evidence is kept and
clamped to it; one further out, unknown or empty is dropped » : appel direct de l'export de
`core/answer-validation.cjs` avec une preuve et cinq citations.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
