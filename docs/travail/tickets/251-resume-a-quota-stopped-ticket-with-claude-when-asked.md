---
id: T251
titre: Resume a quota-stopped ticket with Claude when asked
statut: termine
bloque_par: T231, T268, T280, T284
adr: oui
installe: non
harnais: oui
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le harnais accepte `--fallback-engine claude` : un quota Codex épuisé provoque alors une seule
relève sur Claude, sur le même ticket et le travail déjà écrit, avec revue et contrôles ordinaires.
Sans cette option, l'arrêt explicite de T231 reste inchangé.

## Sources

- Coupe de T231, relecture A, constat 5 ; ADR 0012/0014 et ADR de relève écrit par T229.
  T231 reconnaît le quota, émet `quota-epuise {ticket, reprise}`, remet le ticket en `a-faire`
  et arrête sans compter d'échec. T229 fournit la relève, le verrou et la continuité du lancement.
- Code vérifié à `1d8aa48` : `scripts/loop/run.mjs:36` ne connaît pas de secours ; `:105-106`
  refuse un arbre suivi sale, `:249` lance déjà une session Claude, `:436` marque le ticket
  en cours et `:453` compte une tentative. `scripts/loop/tickets.mjs:24` exclut le statut
  de la spécification figée. Relire ces chemins tels que T229/T230/T231 les ont livrés.
- `scripts/loop/models.mjs:50` choisit un palier d'après le numéro de tentative ; la bascule
  ne doit pas transmettre un nom de modèle Codex à Claude. Bancs :
  `tests/helpers/harness-repo.cjs:11`, `tests/helpers/codex-session.cjs:94`,
  `tests/ticket-loop.test.cjs:2634`.
- Incident quota réel : `/Users/Dabi/Documents/ISN/tvlens/.harness-state/loop/events.jsonl:488`
  et `:491`. T208 n'avait rien écrit (`:487`, `:490`, zéro tour/jeton) : le travail partiel
  est un cas à prouver par le banc, pas une propriété supposée de cet incident.

## Périmètre

- Modifier les options et la coordination de `scripts/loop/run.mjs`, l'aide de relève de T229,
  les helpers et `tests/ticket-loop.test.cjs`. Autorisation de harnais limitée au secours contrôlé ;
  aucune modification des permissions d'agent, des hooks ni des échelles de modèles pour obtenir le vert.
- Valider `--fallback-engine` avant lancement ; seul `claude` est accepté comme secours de Codex.
  Sur l'issue quota de T231, utiliser la relève de T229 pour reprendre ce ticket, sans retraiter
  un ticket terminé. Aucun cycle de bascules entre moteurs ; Claude ne reçoit pas ce secours.
- Traduire les options propres à Codex, notamment `--model` forcé, vers le palier Claude du niveau
  et des tentatives utiles déjà comptées. Documenter la traduction dans l'aide/ADR ; conserver
  les autres options effectives, budgets, cadence d'harmonisation, sorties et identité de lancement.
- Capturer un état de relève propre à ce travail : dépôt, branche, HEAD, ticket/spécification,
  chemins et empreintes du diff et des non-suivis préexistants. Le consommer une seule fois après
  validation. Ne pas autoriser globalement l'arbre sale, ni rebaptiser les nouveaux fichiers du
  travail en fichiers préexistants. Toute divergence refuse la relève et laisse le travail intact.
- Claude reçoit journal et diff. Son contrôle de confinement, sa relecture et tous les contrôles
  ordinaires conditionnent l'intégration de l'état réellement relu. Le quota ne consomme pas de
  tentative utile ; les consommations Codex et toutes les invocations restent dans les traces.
- Conserver `--max`, l'absence de push/rétrospective demandée et la propriété unique du verrou.
  Un lancement Claude refusé laisse ticket/fichiers récupérables et un diagnostic explicite ;
  aucun reset, stash ou commit de secours ne masque le diff.
- Écrire un ADR court de reprise contrôlée après quota, lié dans `docs/architecture.md`, section
  Décisions, et à l'ADR de T229. Ne pas réimplémenter la reconnaissance quota ni la reprise de capacité.

## Critères d'acceptation

1. Avec secours demandé, un quota après modification réelle du dépôt temporaire lance Claude
   exactement une fois sur ce ticket et ce diff. Les fichiers non suivis d'origine sont protégés ;
   les nouveaux fichiers du travail restent dans l'état à relire. Le quota ne consomme pas de palier.
2. La relève refuse HEAD, branche, spécification ou diff changé, état incomplet ou déjà consommé.
   Le lancement ordinaire continue à refuser un arbre sale ; aucun reset, stash ou commit de secours
   ne dissimule le travail. Un échec de démarrage Claude laisse ticket et fichiers récupérables.
3. Options invalides refusées avant agent ; options conservées et modèle Claude cohérent après
   bascule. Le contrôle, l'état relu et le relecteur du nouveau moteur conditionnent toujours
   l'intégration ; `--max` n'est pas réinitialisé. Les consommations Codex restent dans les traces.
4. Sans option, les assertions d'arrêt T231 restent identiques. Une seule instance détient le
   verrou ; journaux, compteurs, rétrospective et harmonisation ne sont ni perdus ni doublés.
5. À l'implémentation, jouer `tests/ticket-loop.test.cjs`, les tests de relève et des lecteurs
   modifiés en séquentiel, puis `node scripts/check.mjs`. Aucun contrôle, test ou plancher affaibli.

## Test d'acceptation attendu

Dans `tests/ticket-loop.test.cjs`, le faux Codex écrit un fichier puis émet le quota ; le faux
Claude de `harnessRepo` vérifie le même diff et produit un changement soumis à une vraie revue
du dépôt temporaire. Le banc observe arguments, empreintes, verrou, événements et intégration,
puis retient ou corrompt chaque frontière de relève. Aucun moteur, push ou dépôt réel n'est utilisé.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La relève après intégration de T229 ne suffit pas à autoriser un travail partiel : son extension
est précisément le livrable. La seule option demandée autorise cette reprise contrôlée sur Claude ;
elle n'assouplit jamais le démarrage ordinaire. Relire les interfaces réelles de T229 et T231.

## Journal

- 19/10, Codex : reprise après `relecture-1.md`, lecture du journal, des écarts, de `git status` et de
  `git diff`. Les deux mineurs sont confirmés : contexte de relève répété et complexité excessive.
  Exploration de correction dans `.harness-state/tickets/T251/exploration.md`, aucun nouvel écart prévu.
- 19/10, Codex : `node --test --test-name-pattern='partial Claude fallback|nonzero Claude exit'
  tests/ticket-loop.test.cjs` : trois rouges observés sur les assertions attendues (consigne répétée,
  sortie 1 au lieu de 2), puis trois verts après correction minimale ; sorties
  `correction-1-rouge.log` et `correction-1-vert.log` dans le dossier d'état. État initial, refus de
  relève et évaluation du verdict extraits ; validation de réception découpée en options, historique
  et bornes. Mesure par la règle ESLint locale : `processTicket` 32 → 10, `receiveQuotaWork` 16 → 5,
  fonctions extraites de complexité au plus 12 et de moins de 80 lignes.
- 19/10, Codex : vérification après découpe : les 41 cas ciblés de relève passent (`correction-1-releve.log`).
  `node scripts/check.mjs --changed` : vert, dont 346 tests de boucle ; règles, format, lint, gel et
  cliquet verts, aucun plancher modifié (`correction-1-check-changed.log`).
- 19/10, Codex : `node --test --test-concurrency=1 tests/reviewed-state.test.cjs
  tests/loop-view-events.test.cjs tests/loop-view-codex.test.cjs tests/loop-view-state.test.cjs
  tests/watch-loop.test.cjs` : 129 tests réussis (`correction-1-lecteurs.log`). Puis
  `node scripts/check.mjs` : vert, 2 960 tests JavaScript sur 153 fichiers et 54 tests Python réussis
  (`correction-1-check-complet.log`). Spécification inchangée, deux constats mineurs corrigés,
  aucune contestation ; nouveau verdict `TERMINÉ`, sans réserve propre, sans commit ni push.
- 19/10, Codex : exploration des interfaces réelles T229/T231 terminée, consignée dans
  `.harness-state/tickets/T251/exploration.md`. Aucun écart prévu ; reprise par IPC, empreintes du travail
  et des non-suivis initiaux, budget utile conservé et traduction vers le palier Claude.
- 19/10, Codex : rouges observés puis corrigés sur la relève (arrêt 5 au lieu de reprise), les options
  répétées, l'indexation des non-suivis initiaux et l'obligation d'une nouvelle revue Claude. Commandes
  ciblées `node --test --test-name-pattern='<comportement>' tests/ticket-loop.test.cjs` et sorties dans
  `.harness-state/tickets/T251/{rouge-*,vert-*}.log`. Le premier rouge des options répétées a invoqué
  par erreur le binaire Codex réel, faute de doublure sur ce chemin ; refus de processus et de hooks,
  aucune action d'agent observée dans la sortie, puis banc corrigé.
- 19/10, Codex : `node --test tests/ticket-loop.test.cjs` : 338 tests réussis, 0 échec (237,1 s), sortie
  `ticket-loop.log`. Ajout ensuite des cas de capacité/correction, contenus préexistants, budget implicite
  et rechargement de module après relève ; vérification finale en cours. ADR 0060 écrit et lié.
- 19/10, Codex : vérification finale ciblée de la relève : 39 tests réussis, 0 échec (`releve-finale.log`).
  `node --test --test-concurrency=1 tests/reviewed-state.test.cjs tests/loop-view-events.test.cjs
  tests/loop-view-codex.test.cjs tests/loop-view-state.test.cjs tests/watch-loop.test.cjs` : 129 tests réussis,
  0 échec (`lecteurs.log`). `node scripts/check.mjs --changed` : vert, dont les 344 tests de boucle.
  Contrôle complet lancé en séquentiel ; résultat à suivre dans `check-complet.log`.
- 19/10, Codex : `node scripts/check.mjs` : vert ; règles, format, lint, gel du lint, cliquet,
  2 958 tests JavaScript (153 fichiers) et 54 tests Python réussis. `git diff --check` : aucune erreur.
  Preuves et sorties conservées dans `.harness-state/tickets/T251/`. Verdict `TERMINÉ`, sans commit ni push.
  Réserve propre hors périmètre : le total financier de `scripts/loop/retro.mjs:64` assimile déjà les coûts
  inconnus à zéro ; la ligne par session et le bilan d'intégration conservent leur caractère inconnu.

- 18/10, propriétaire : ticket hors du chemin GX10, repoussé après la copie B (T260). Dépendance d'ordre ajoutée
  (`T260`), sans lien de code ; la retirer rend l'ordre par numéro.
- 18/10, propriétaire, sur l'avis d'Astra : la copie B (T259, T261, T260) et sa recette T280 passent avant ce
  ticket.
- 18/10, propriétaire : les réglages des modèles locaux (T282, T283) et leur contrôle T284 passent avant ce
  ticket.

### Réserves à la clôture

- .harness-state/tickets/T251/relecture-2.md : 1. `scripts/loop/run.mjs:151` (`preflight`) — hors périmètre

  - **Ce qui ne va pas.** La complexité de `preflight` est de 26 selon la règle ESLint `complexity` (`correction-1-complexite-apres.json`). La limite des standards est de 15. Avant le ticket, je compte 9 sur les lignes de contexte de `revue-2.diff`. Le ticket a ajouté environ 17 points :
    - le refus d'un `--fallback-engine` répété ;
    - la validation du secours ;
    - `&& !launch?.quotaResume` ;
    - l'appel de `receiveQuotaWork` ;
    - les trois `launch?.… ?? …` ;
    - le `try/catch` et le ternaire de `preexisting`.
    
    La première relecture ne l'avait pas relevé.
  - **Ce qui est attendu.** Extraire la validation des options de secours et le calcul du contexte (`untrackedBefore`, `preexisting`, `untracked`) en fonctions dédiées.
  - **Classe.** La correction n'a pas touché cette fonction et ce n'est pas bloquant. Je la classe donc hors périmètre et en réserve, comme le demande la relecture de correction.
- .harness-state/tickets/T251/relecture-2.md : 2. `scripts/loop/run.mjs:377` (`gates`) — hors périmètre

  - **Ce qui ne va pas.** La complexité de `gates` est de 16 selon le même outil, au-dessus de 15. Avant le ticket, je compte 12. Les ajouts sont `preexisting && …`, `if (changed)` et `if (reviewBefore && …)`.
  - **Ce qui est attendu.** Regrouper les deux contrôles propres à la relève (non suivis préexistants et nouvelle relecture) dans une fonction que `gates` appelle.
  - **Classe.** Code non touché par la correction : hors périmètre, en réserve.
- .harness-state/tickets/T251/relecture-2.md : 3. `scripts/loop/retro.mjs:64` — hors périmètre (repris de la relecture 1)

  Le « Coût total des sessions » compte toujours un coût inconnu comme zéro. Ce défaut existait avant le ticket et `ecarts.md` le déclare. Il est à traiter dans un ticket qui touche `retro.mjs`.
- .harness-state/tickets/T251/relecture-2.md : 4. `scripts/loop/quota-handoff.mjs:17` — hors périmètre (repris de la relecture 1)

  La valeur `256 * 1024 * 1024` est écrite telle quelle à trois endroits : ici, dans `run.mjs:72` et dans `reviewed-state.mjs:29`. Lui donner un nom unique demande de modifier `reviewed-state.mjs`, qui n'est pas dans la liste du périmètre.
