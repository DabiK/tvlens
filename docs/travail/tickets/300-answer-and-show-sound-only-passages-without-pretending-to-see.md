---
id: T300
titre: Answer and show sound-only passages without pretending to see
statut: a-faire
bloque_par: T299
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les questions, le réexamen, le résumé, la frise et les vues traitent un passage son seul honnêtement : le réexamen
d'images est refusé avec une raison qui oriente vers les paroles, les réponses citent les paroles, la frise regroupe
les passages son seul dans une carte « Son seul · image indisponible », et la TV comme le Mac disent que l'image
manque.

## Sources

- Décision du propriétaire, le 19/10 : analyser le son seul quand l'image est noire ; chantier en premier.
- Choix de l'orchestrateur, le 19/10 : refus explicite de `inspect_clip` qui oriente vers `get_transcript` ; aucun
  sujet tiré de la transcription (ce serait un nouvel appel de modèle) ; cartes consécutives regroupées.
- Code à `c35cd02` :
  - `core/video-tools.cjs` : `reexaminable` (`:43`, un clip audio rejouable serait admis à tort), message
    `MEDIA_GONE` (`:6-9`, `:251-252`), `:122`, `get_transcript` (`:239-243`), `context()` (`:180-187`) ;
  - `core/video-tool-contracts.cjs:27-29` (description d'`inspect_clip`) ; `adapters/companion-prompt.cjs:53`, `:86`,
    `:88` (le mode réexamen impose `inspect_clip`) ; `adapters/clip-inspector.cjs:25-36` (garde défensive) ;
  - `core/deep-ask.cjs:206-211` (« fin de l'intervalle pas encore analysée ») ;
  - `core/living-recap.cjs:55`, `:61`, `:65` ; `core/session-timeline.cjs:23-35`, `:69` (sans sujet, chaque passage
    de 8 s devient une carte « Analyse partielle ») ; `core/perception-context.cjs:5-8` ;
  - `runtime/state-views.cjs:45-58`, `:252-260` ; `tv/app/companion.js:554-567` ; `tv/app/timeline-view.js` ;
    `app/ui/sessions-view.mjs:65-67`, `app/ui/job-card.js:36`, `:179`.
- Tests : `tests/video-research.test.cjs`, `tests/clip-unreadable.test.cjs:174`, `tests/living-recap.test.cjs`,
  `tests/session-timeline.test.cjs`, tests `tv-*` de la page.

## Périmètre

- À modifier : les fichiers cités ci-dessus et leurs tests.
- `inspect_clip` sur un passage son seul : refus explicite et nommé, « Ce passage n'a que le son : lire ses paroles. »,
  sans appel au modèle de vision ; le refus est visible dans l'audit de la réponse.
- Les consignes du modèle de questions disent qu'un passage son seul se réexamine par ses paroles.
- La frise regroupe des passages son seul consécutifs en une carte « Son seul · image indisponible » ; le résumé les
  inclut par leurs paroles.
- La TV et le Mac affichent « Son seul » sur ces passages ; aucune image ni miniature n'est attendue.
- À ne pas toucher : la capture TV (T301), le fil et le serveur (T299).

## Critères d'acceptation

1. Question sur une session où les passages sont son seul : aucun appel de vision ; `inspect_clip` refusé avec la
   raison nommée ; la réponse cite des paroles. Le test échoue avant la correction.
2. Frise : trois passages son seul consécutifs donnent une seule carte « Son seul · image indisponible ».
3. Résumé : les passages son seul y entrent par leurs paroles.
4. Vues TV et Mac : un passage son seul est marqué comme tel.
5. Les sessions avec images gardent leur comportement : tests existants inchangés.
6. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/video-research.test.cjs` : une question sur des passages son seul, de l'outil refusé à la réponse citée.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, propriétaire : le chantier « son seul » (T297 à T302) passe en tête de file, après T225.
