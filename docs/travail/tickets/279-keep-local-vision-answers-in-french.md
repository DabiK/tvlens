---
id: T279
titre: Keep local vision answers in French
statut: termine
bloque_par: T278
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un modèle vision local (Ollama) répond en français, comme Codex, même quand la vidéo ou ses paroles sont dans une autre
langue. Une réponse rendue dans une autre langue est redemandée une seule fois ; si elle le reste, elle est publiée
avec une limite nommée et une mesure, jamais corrigée ni remplacée en silence.

## Sources

- Contrôle réel T273, le 18/10, au commit `c13fd0e` : par le runner de rejeu, `gemma3:4b` a répondu en anglais sur 2
  des 9 blocs du discours de Kennedy (`media/samples/kennedy-rice-7min.mp4`), malgré la consigne « Décris en
  français ». Sur le live français du 17/10 (T272), il a répondu en français 4 fois sur 4. Codex n'a jamais dévié.
  Trace : `experiments/essais/2026-10-18-conversion-video-mac/`.
- Décision du propriétaire, le 18/10 : renforcer ce cas « soit par le prompt soit par la configuration ».
- Code à `c13fd0e` :
  - `adapters/codex-perception.cjs:201-205` : la consigne commune « Décris en français le passage ACTUEL uniquement »
    est envoyée à Codex comme à l'agent local ;
  - `adapters/local-vlm-agent.cjs:74-90` : `LocalVlmAgent.run` reçoit `instructions` et les envoie à Ollama ;
    le même agent sert la perception de fond et le réexamen (T265).

## Périmètre

- À modifier : `adapters/local-vlm-agent.cjs`, une règle pure de détection de langue sous `core/` si elle est utile,
  leurs tests ; la composition seulement si l'agent en a besoin.
- Pour le seul backend local : une consigne de langue renforcée, placée en dernier dans les instructions envoyées à
  Ollama (« Réponds uniquement en français, même si la vidéo ou ses paroles sont dans une autre langue. »). La
  consigne commune et le chemin Codex ne changent pas : la référence Codex de G1 et G2 reste comparable.
- Après une réponse valide, ses champs de texte rédigés (`summary`, `visual`, `topic`, `uncertainty`) sont jugés par
  une règle simple et déterministe, sans modèle ni réseau. Une réponse jugée non française est redemandée une seule
  fois, avec la même borne de temps. Si la seconde l'est encore, elle est publiée telle quelle, avec une limite en
  français dans `uncertainty` et une mesure `language` (langue jugée, nombre de tentatives) dans les métriques.
- Un texte cité tel qu'il apparaît à l'écran ou dans les paroles (entre guillemets) ne compte pas comme une réponse en
  autre langue.
- À ne pas toucher : le prompt et le chemin Codex, l'agent de questions Ollama (T263), la transcription Whisper, les
  schémas d'observation, le harnais.

## Critères d'acceptation

1. Par la vraie perception et un faux Ollama, la requête locale finit par la consigne de langue renforcée ; une
   requête Codex doublée reste identique à celle d'avant ce ticket.
2. Un faux Ollama qui répond d'abord en anglais puis en français : deux appels, la réponse française est publiée, la
   mesure indique deux tentatives.
3. Un faux Ollama qui répond deux fois en anglais : deux appels seulement, réponse publiée avec sa limite en français
   et la langue jugée dans les métriques ; aucune troisième tentative, aucun repli sur Codex.
4. Une réponse française qui cite un titre anglais entre guillemets : un seul appel.
5. La seconde tentative respecte la borne de temps et l'annulation de la première.
6. `node scripts/check.mjs`.

## Test d'acceptation attendu

Dans le test de l'agent local : réponse anglaise puis française d'un faux Ollama, deux appels, réponse française
publiée et mesure des tentatives.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- Exploration : agent, perception, composition, tests et ADR concernés lus ; état initial conservé. Plan et écart technique de transmission des métriques consignés dans `.harness-state/tickets/T279/`.
- Prompt : `node --test --test-name-pattern='local perception appends' tests/local-vlm-agent.test.cjs` rouge sur la consigne finale absente, puis vert ; empreinte de la requête Codex doublée inchangée.
- Redemande : `node --test --test-name-pattern='local perception retries' tests/local-vlm-agent.test.cjs` rouge sur la réponse anglaise publiée, puis vert (deux appels, français publié, `language: { judged: 'fr', attempts: 2 }`).
- Limite : `node --test --test-name-pattern='two English answers' tests/local-vlm-agent.test.cjs` rouge sur la limite absente, puis vert ; deux appels seulement, prose conservée et langue `en` publiée.
- Champs et citations : rouge observé sur le titre anglais bref puis correction ; `node --test --test-name-pattern='every authored' tests/local-vlm-agent.test.cjs` vert. Citations multilignes et apostrophes : rouge puis vert avec `node --test --test-name-pattern='French prose quoting' tests/local-vlm-agent.test.cjs`.
- Borne textuelle : `node --test --test-name-pattern='at the text bound|two English answers' tests/local-vlm-agent.test.cjs` vert après reproduction du refus d’une uncertainty valide de 8000 caractères augmentée de notre limite. La limite s’assemble désormais après validation, sans tronquer le texte.
- Annulation : `node --test --test-name-pattern='language retry shares' tests/local-vlm-agent.test.cjs` vert ; même signal et mêmes échéances, annulation appelant, délais local/perception et fermeture pilotés aux en-têtes et au corps de la seconde tentative ; file conservée.
- `node scripts/check.mjs --changed` : vert, 26 tests passés ; règles, format, lint, gel et cliquet verts. Commandes et sorties conservées dans `.harness-state/tickets/T279/`. Aucun modèle réel lancé ; lecture des processus par `ps` refusée par le bac à sable.
- Premier `node scripts/check.mjs` : rouge, 2834/2837 tests JS et 47 tests Python passés. Trois régressions de rejeu reproduites avec `node --test --test-name-pattern='execution traverses|held calls preserve|one HTTP request' tests/local-perception-replay.test.cjs` : diagnostic final dupliqué, puis prompt réellement envoyé à conserver avant l’appel. Correction sans changer les tests du rejeu ni le runner : diagnostic enrichi avec la même identité et préparation locale idempotente des instructions, visible à la frontière answer. Même commande ensuite verte (3/3), puis `node --test tests/local-perception-replay.test.cjs` vert (20/20). Nouveau `node scripts/check.mjs --changed` vert (26/26). Sorties initiales et corrigées conservées dans le dossier d’état.
- Contrôle final `node scripts/check.mjs` : vert, 2837/2837 tests JS sur 151 fichiers, 47 tests Python ; règles, format, lint, gel et cliquet verts. `git diff --check` : vert. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T279/verdict.json` ; aucun commit ni push, relecture laissée à la boucle.
- Reprise après relecture 1 : rapport, journal, écarts, état Git et diff relus ; les deux bloquants et le mineur sont acceptés. Plan de correction consigné dans `exploration-correction-1.md` et `ecarts.md`, sans changement du transport Codex ni des schémas.
- Correction du constat 1 : `node --test --test-name-pattern='visual metrics discard model-claimed' tests/codex-thread-rotation.test.cjs` rouge sur une limite de langue revendiquée par le modèle Codex, puis vert après publication conditionnée par un rapport enregistré dans l’agent local (WeakMap). Le test revendique aussi `language` et vérifie son absence dans les métriques. Le transport Codex reste inchangé. Régressions locales ciblées : 3/3 vertes (`local perception retries|two English answers|at the text bound`).
- Correction du constat 2 : `node --test --test-name-pattern='ordinary French prose' tests/local-vlm-agent.test.cjs` rouge sur deux appels pour « Texte en surimpression en bas de l’écran ». Les mots français sont désormais exclus des scores étrangers ; le bonus de `the` est réservé aux champs sans indice français. Même comportement et langues étrangères : `node --test --test-name-pattern='ordinary French prose|every authored' tests/local-vlm-agent.test.cjs` vert (2/2), dont les phrases de la relecture et « Audition de The Voice » dans les quatre champs.
- Correction du constat 3 : tests de caractérisation écrits et observés verts avant extraction (`validation agree|local perception appends`, 2/2). `core/visual-observation.cjs` possède maintenant champs, borne, continuités et vérification partagée par perception et langue. Après extraction, `node --test --test-name-pattern='validation agree|local perception appends|an invalid observation' tests/local-vlm-agent.test.cjs` vert (3/3) ; empreintes du prompt Codex et du schéma inchangées. Aucun changement des critères de validité.
- `node scripts/check.mjs --changed` après correction 1 : vert, 44/44 tests sur deux fichiers ; règles, format, lint, gel et cliquet verts. Journaux `correction-1-*.log` conservés dans le dossier d’état.
- Contrôle final de correction : `node scripts/check.mjs` vert, 2839/2839 tests JS sur 151 fichiers et 47 tests Python ; règles, format, lint, gel et cliquet verts (`correction-1-check-full.log`). `git diff --check` : code 0, aucune sortie. Les trois constats sont corrigés ; nouveau verdict `TERMINÉ`, sans commit ni push. Relecture laissée à la boucle.
- Reprise après relecture 2 : rapport, journal, écarts et état Git relus ; nouveau constat mineur accepté. Correction limitée aux cinq marqueurs ajoutés à tort au français, avec reproduction à la frontière `observeVisual`. Plan consigné dans le dossier d’état ; aucun nouveau périmètre.
- Correction du constat mineur de la relecture 2 : `node --test --test-name-pattern='short English and Spanish prose' tests/local-vlm-agent.test.cjs` rouge sur un appel au lieu de deux pour « People are watching the stage. ». Retrait de `es con las but are` des seuls indices français : les listes étrangères existantes les reprennent. `node --test --test-name-pattern='short English and Spanish prose|ordinary French prose|French prose quoting|every authored' tests/local-vlm-agent.test.cjs` vert (5/5), avec les cinq phrases étrangères dans les quatre champs (deux appels, `en` ou `other`, prose inchangée, limite visible), et les tests français/citations/validité maintenus.
- `node scripts/check.mjs --changed` après correction 2 : vert, 45/45 tests sur deux fichiers ; règles, format, lint, gel et cliquet verts. `git diff --check` : code 0, aucune sortie. Sorties conservées dans les journaux `correction-2-*.log`.
- Contrôle final de correction 2 : `node scripts/check.mjs` vert, 2840/2840 tests JS sur 151 fichiers et 47 tests Python ; règles, format, lint, gel et cliquet verts (`correction-2-check-full.log`). `git diff --check` : code 0, aucune sortie. Constat mineur corrigé, nouveau verdict `TERMINÉ`, sans commit ni push ; relecture laissée à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T279/relecture-3.md : **Écart accepté, critères 2 et 3, section « Correction après relecture 2 »** (cinq marqueurs rendus aux listes étrangères, sans changer les seuils ni la neutralisation des mots français). C'est une mise en œuvre de l'option proposée par la relecture 2, sans nouvel écart à un critère. Les critères 2 à 4 restent couverts par leurs tests, et le nouveau test renforce les critères 2 et 3.
