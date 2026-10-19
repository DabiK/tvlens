---
id: T300
titre: Answer and show sound-only passages without pretending to see
statut: termine
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
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T300/exploration.md` ; absence déclarée déjà durable, projections et réexamen à adapter. Tests d'abord, sans essai matériel ni fournisseur réel.
- 19/10, Codex : `node --test --test-name-pattern='question refuses sound-only' tests/video-research.test.cjs` : deux rouges observés sur le refus générique, puis deux verts après refus nommé, audit et citations des paroles en chat/réexamen (`red-question.log`, `green-question.log`).
- 19/10, Codex : garde défensive de l'inspecteur, frise/résumé/contexte et vues TV/Mac : rouges sur leurs assertions puis verts ; commandes et sorties conservées dans `.harness-state/tickets/T300/` (`red-inspector`, `red-projections`, `red-views` et leurs verts). Le premier contrôle a révélé un nom masqué et un sélecteur non pris en charge par le banc Mac, corrigés sans modifier le harnais.
- 19/10, Codex : `node scripts/check.mjs --changed` : vert, 157 tests réussis. `node --test tests/video-research.test.cjs tests/ollama-question-agent.test.cjs tests/session-timeline.test.cjs tests/living-recap.test.cjs tests/perception-context.test.cjs tests/clip-unreadable.test.cjs tests/tv-chat-view.test.cjs tests/mac-ui.test.cjs tests/state-views.test.cjs` : 192/192 réussis (`targeted.log`). Contrôle complet à suivre.
- 19/10, Codex : premier `node scripts/check.mjs` : 3015/3018 tests JS réussis, 54 tests Python réussis. Trois régressions observées (`check-full-red.log`) : consignes de tour trop longues et confusion entre absence de clés d'image et déclaration son seul. Un test supplémentaire reproduit la seconde ; correction par `metadata.hasImages === false`, et consigne commune portée par le rôle du fil. Aucun test existant modifié.
- 19/10, Codex : `node --test tests/video-research.test.cjs tests/codex-confinement.test.cjs tests/living-recap-runtime.test.cjs tests/split-perception.test.cjs tests/session-timeline.test.cjs tests/living-recap.test.cjs tests/state-views.test.cjs tests/tv-chat-view.test.cjs tests/mac-ui.test.cjs` : 209/209 réussis (`green-regressions.log`). `node scripts/check.mjs --changed` : vert, 158 tests réussis (`check-changed-final.log`).
- 19/10, Codex : second `node scripts/check.mjs` : vert, 3019/3019 tests JS (154 fichiers) et 54 tests Python réussis ; règles, format, lint, gel et cliquet validés (`check-full.log`). `git diff --check` sans erreur. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T300/verdict.json`. Vues exercées sur bancs simulés ; aucun essai TV/VPS ou fournisseur réel, aucun commit ni push.
- 19/10, Codex, reprise : lecture de `relecture-1.md`, du journal, des écarts, de l'état et du diff sur `96cce95`. Les sept constats sont acceptés ; corrections prévues dans `.harness-state/tickets/T300/corrections-1.md`, sans nouveau périmètre.
- 19/10, Codex, correction : `node --test --test-name-pattern='question refuses sound-only' tests/video-research.test.cjs` : deux rouges sur l'audit doublé, puis deux verts ; ajout de l'assertion de comptage : rouge `9 !== 6` en chat, puis deux verts après correction. Sorties `correction-audit-{red,green}.log` et `correction-evidence-{red,green}.log` dans le dossier d'état.
- 19/10, Codex, correction : `node --test --test-name-pattern='inspection instructions keep' tests/video-research.test.cjs` : rouge puis vert ; plafond et restriction des paroles couverts en Codex, local et legacy (`correction-prompt-{red,green}.log`).
- 19/10, Codex, correction : `node --test --test-name-pattern='outside the panel window' tests/tv-chat-view.test.cjs` : rouge puis vert pour les citations historiques et hors fenêtre. `node --test --test-name-pattern='pinned TV' tests/tv-chat-view.test.cjs` : deux rouges puis deux verts ; un contrôle complémentaire inclut la demande de miniature contradictoire. Sorties `correction-old-citations-{red,green}.log` et `correction-pinned-{red,green}.log`.
- 19/10, Codex, correction : `node --test --test-name-pattern='light speech excerpts' tests/state-views.test.cjs` : rouge puis vert sur la préservation des résumés d'images vides ou null. `node --test --test-name-pattern='inspector refuses a declared|Mac sound-only citations' tests/clip-unreadable.test.cjs tests/mac-ui.test.cjs` : deux verts après import du message partagé et décision du suffixe Mac sur les données.
- 19/10, Codex, correction : `node --test tests/video-research.test.cjs tests/codex-confinement.test.cjs tests/ollama-question-agent.test.cjs tests/chat-codex.test.cjs tests/clip-unreadable.test.cjs tests/tv-chat-view.test.cjs tests/tv-paired-page.test.cjs tests/state-views.test.cjs tests/server-state-views.test.cjs tests/mac-ui.test.cjs` : 234/234 verts (`correction-targeted.log`). `node scripts/check.mjs --changed` : vert, 163/163 tests (`correction-check-changed-final.log`).
- 19/10, Codex, correction : `node scripts/check.mjs` : vert, 3024/3024 tests JS (154 fichiers), 54 tests Python réussis ; règles, format, lint, gel et cliquet validés (`correction-check-full.log`). `git diff --check` sans erreur. Nouveau verdict `TERMINÉ`, sept constats corrigés, aucune réserve ; aucun commit ni push, aucun essai matériel ni fournisseur réel.

### Réserves à la clôture

- .harness-state/tickets/T300/relecture-2.md : **Écart accepté, raccord `adapters/ollama/question-agent.cjs` :** même raison qu'en relecture 1. Sans lui, le critère 1 était impossible. Seul le code nommé passe, avec un message fixe.
- .harness-state/tickets/T300/relecture-2.md : **Écart accepté, `tv/app/chat-view.js` au lieu de `companion.js` :** `mediaLabel` se trouve désormais dans ce fichier. Le changement reste un libellé de passage, sans toucher au transport.
