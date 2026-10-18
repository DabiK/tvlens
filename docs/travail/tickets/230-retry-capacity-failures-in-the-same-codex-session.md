---
id: T230
titre: Retry capacity failures in the same Codex session
statut: a-faire
bloque_par: T229
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une indisponibilité de capacité Codex provoque des reprises bornées de la session au même palier
avant de compter un échec. Le harnais distingue ce cas d'un refus d'implémentation ou de relecture,
sans perdre le travail, les traces ou les contrôles de confinement de la session.

## Sources

- Plan du 17/10, T230 ; T199 et son journal fixent la reconnexion rattrapée.
  Trace réelle dans le dépôt principal, où tourne la boucle :
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/T202/codex-1.jsonl:157-158`
  (`error` puis `turn.failed`, même message « Selected model is at capacity. Please try a different model. »),
  pendant la correction qui reprend le fil (`:100`) après une première relecture.
  La fixture reproduit ces deux lignes et cite leur provenance.
- Code vérifié à `1d8aa48` : `scripts/loop/codex.mjs:89` décode les événements JSONL ;
  `scripts/loop/codex.mjs:99` efface les erreurs récupérées seulement sur `turn.completed` ;
  `scripts/loop/codex.mjs:106` rend `turn.failed` terminal et `scripts/loop/codex.mjs:130`
  reprend la dernière erreur non récupérée à la sortie de l'enfant.
- `scripts/loop/codex.mjs:138` vérifie l'identité et `scripts/loop/codex.mjs:142` le témoin
  des hooks, appelés à chaque invocation par `scripts/loop/codex.mjs:174` ;
  `scripts/loop/codex.mjs:182` reprend une correction ; `scripts/loop/codex.mjs:329` pilote la
  tentative et ses relectures. Une correction n'est pas une reprise de capacité.
- `scripts/loop/run.mjs:453` ajoute toute issue à l'historique avant classification ;
  `scripts/loop/run.mjs:472` écrit le refus. `scripts/loop/models.mjs:50` choisit le palier
  d'après le numéro de tentative. T229 stabilise les mêmes fichiers et le même banc.
- `tests/helpers/codex-session.cjs:94` construit les événements du faux Codex ;
  `tests/ticket-loop.test.cjs:2599` couvre les reconnexions récupérées et
  `tests/ticket-loop.test.cjs:2634` les erreurs terminales qui doivent rester des échecs.

## Périmètre

- Modifier `scripts/loop/codex.mjs`, son raccord à `scripts/loop/run.mjs` si nécessaire,
  `tests/helpers/codex-session.cjs` et `tests/ticket-loop.test.cjs`. Autorisation de harnais
  limitée à cette politique et aux aides nécessaires ; ne pas changer les échelles de modèles.
- Classer à la frontière du flux les erreurs explicites de capacité/surcharge. Conserver un
  résultat structuré distinct de `problem`. Établir les variantes reconnues par des fixtures
  d'événements `error`/`turn.failed` ; le texte d'un outil, d'un fichier lu, d'une réponse agent,
  stderr seul ou la seule sortie non nulle ne suffit jamais à classer la capacité.
- Si Codex récupère déjà dans la même invocation et termine son tour, garder T199 : aucune
  invocation supplémentaire. Sinon attendre la sortie réelle de l'enfant, puis retenter avec
  attente, au même modèle, effort, relecteur et numéro de tentative. Réutiliser l'identité du
  fil quand elle est connue et validée, y compris pendant une correction après relecture.
- Nommer à un seul endroit un nombre maximal de reprises et les attentes correspondantes.
  Injecter attente/temps dans l'aide de reprise pour les tests. `--timeout-min` borne aujourd'hui
  chaque invocation (`scripts/loop/codex.mjs:115`, `:343`, `:373`), pas la tentative. Les reprises
  de capacité d'une même invocation partagent son délai : une reprise ne reçoit que le temps restant.
  Ne pas consommer le budget des corrections de relecture pour une indisponibilité du fournisseur.
- Garder les témoins de hooks neufs par invocation, le contrôle d'identité, les options de reprise
  et les protections d'outils. Une identité absente ne permet pas d'inventer une session ; ne
  démarrer à neuf que si aucun travail n'a pu commencer, sinon rendre un refus explicite.
  Un échec de confinement ou une reprise impossible ne devient pas une boucle de capacité.
- Journaliser ticket, tentative, invocation, reprise et attente, avec diagnostic borné. Conserver
  toutes les invocations et leur consommation dans le rapport de la tentative ; ne pas écraser
  le JSONL lors d'une reprise. Après épuisement seulement, compter un échec et laisser la boucle
  suivre sa politique ordinaire d'escalade. Le quota épuisé sera traité séparément par T231.

## Critères d'acceptation

1. Capacité puis succès, avec `--attempts 1` : le ticket est intégré en une tentative ; les appels
   de reprise gardent fil, modèle et effort, et la relecture n'est lancée qu'après un vrai succès.
   Les attentes observées sont celles de la politique bornée, sans attente murale dans le test.
   Le banc fixe les attentes du vrai chemin de boucle par une couture nommée
   (option ou variable lue par `scripts/loop/codex.mjs`).
2. Une série de surcharges s'arrête à la borne ou au plafond de durée ; elle produit exactement
   un refus compté, puis une escalade ordinaire si une tentative reste. Aucun troisième chemin
   de correction ou compteur infini n'est ajouté.
3. Une capacité pendant une correction reprend cette correction et conserve le rapport précédent,
   son interdiff et le nombre de corrections utiles. Le travail déjà écrit demeure ; aucune
   relecture antérieure ne suffit à accepter l'état nouveau.
4. Les erreurs rattrapées de T199 ne déclenchent pas la nouvelle reprise ; échec inconnu,
   authentification, hook absent, identité étrangère, arrêt ou délai gardent leur issue terminale.
   Une phrase de capacité dans un résultat d'outil ou une réponse agent n'active pas la politique.
5. Chaque invocation a sa trace et sa consommation, même si elle n'a pas abouti. Pas de relecteur
   sur une invocation échouée, pas de processus laissé vivant avant la suivante.
6. À l'implémentation, jouer `tests/ticket-loop.test.cjs` en séquentiel, avec les cas T199 et T229,
   puis `node scripts/check.mjs`. Aucun test, contrôle de reprise ou plancher n'est affaibli.

## Test d'acceptation attendu

Le faux exécutable de `tests/helpers/codex-session.cjs` émet des suites déterministes de capacité,
reprise et succès ou refus. `tests/ticket-loop.test.cjs` observe arguments, témoins, journaux,
nombre de relectures et commits du dépôt temporaire. Un banc de l'aide injectée prouve les
attentes et le plafond ; il complète la preuve par le vrai chemin de boucle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le plan ne donne pas de taxonomie fournisseur exhaustive. La liste reconnue sera limitée aux
formes explicitement caractérisées, dont la forme de la trace de T202, jamais à tout `rate_limit`, 429
ou échec réseau. Les bornes choisies sont une politique technique documentée, pas une mesure
du temps de retour du fournisseur. Aucun appel Codex réel n'est requis pour cette preuve.

## Journal
