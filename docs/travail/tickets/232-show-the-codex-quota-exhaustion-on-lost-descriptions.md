---
id: T232
titre: Code the Codex quota exhaustion and keep it on the lost description
statut: a-faire
bloque_par: T227, T280
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un refus pour quota Codex épuisé porte un code et une reprise annoncée ; la description perdue
garde une cause indépendante du fournisseur, dans la consultation, l'archive et l'événement de
perte. Les chemins existants de question et de surveillance rendront le message fixe traduit
par le client partagé. Les cartes et détails de passages seront traités par T252.

## Sources

- Plan du 17/10, T232 ; relecture A, constats 3 et 4 ; ADR 0031/0039 pour les codes à la source
  et leur lecture sans comparaison de message, ADR 0008 pour l'unique redemande autorisée.
  `docs/domaine.md:190-193` impose la traduction des fournisseurs, dont Ollama ; `:320-325`
  interdit le renommage des champs et valeurs persistés.
- Code vérifié à `1d8aa48` : `adapters/codex-session-events.cjs:122` conserve un diagnostic
  expurgé ; `:125-134` définit `failureMessage`, dont le message fixe du 401 ; `:137` construit
  l'erreur de tour non terminé sans code quota. `adapters/chat-trace.cjs:13` borne les champs.
- `adapters/codex-perception.cjs:45-50` sépare refus et erreurs passagères ;
  `core/session.cjs:361` conserve seulement `error.message` comme `visionError` et compte la
  perte. `core/memory/memory-view.cjs:5` ne publie actuellement aucun code/date de cette perte.
- La TV ne montre pas ces erreurs dans ses cartes (`tv/app/timeline-view.js:247-257`) ou son
  détail (`:357-372`) ; elle rend le message de question via `tv/app/chat-model.js:134-136`
  et `tv/app/chat-view.js:26`, et celui des affirmations via `tv/app/surveillance-view.js:284`.
  `app/renderer.js:153` rend `lastError` ; `tests/chat-error-ui.test.cjs` couvre les erreurs de chat.
- `adapters/codex-quota.cjs:7` lit des fenêtres avec `resetsAt` à titre informatif : cela ne
  prouve pas qu'un tour a été refusé pour quota. Filets : `tests/codex-session-events.test.cjs:117`,
  `tests/split-perception.test.cjs:87`, `tests/architecture-f08.test.cjs:96`,
  `tests/wire-contract.test.cjs:51` et `tests/tv-panel.test.cjs`.
- T227 implique voies T214, pertes T216, événements T221 et racine T220/T226 : relire leurs
  interfaces livrées et le convertisseur T208, pas les anciens accès de la racine ci-dessus.

## Périmètre

- Déclarer/exporter à l'émetteur une identité telle que `TVLENS_CODEX_QUOTA_EXHAUSTED` et une
  reprise facultative bornée. Classer les seuls diagnostics d'échec du tour courant par champs
  fournisseur caractérisés ; la reconnaissance de texte fournisseur reste dans l'adaptateur.
  Aucun contenu regardé, résultat d'outil, réponse ou log global ne suffit à classer le refus.
- Dans `failureMessage`, sur le modèle du 401, traduire ce refus par le texte fixe
  « Quota Codex épuisé, reprise le … » ou « Quota Codex épuisé. ». Le client est partagé par
  perception, questions, surveillance et vérification : les chemins existants rendent ce texte,
  sans nouveau composant ni changement d'interface. Aucun diagnostic fournisseur brut ne s'affiche.
- Caractériser séparément quota épuisé, débit passager, capacité, 401, annulation et erreur
  inconnue. `rate_limit`, 429 ou une fenêtre à 100 % ne suffisent pas à déduire la cause.
  Ne pas inventer date, fuseau ou règle de réserve à partir de la jauge informative.
- La Mémoire enregistre une cause indépendante du fournisseur, traduite du code d'adaptateur
  à la frontière de la perception ; le champ et sa valeur, persistés pour toujours, sont fixés
  dans un ADR. Faire suivre cette cause et la reprise comme données génériques détachées,
  sans import Codex dans `core/`. Conserver `visionError`, statuts et compteurs historiques.
- Ajouter cette cause à la vue de consultation et à l'archive T208. La perte `PassageLost`
  T221 porte la même cause une seule fois. Le quota est un refus, sans marqueur passager ni
  redemande automatique. Les projections visuelles et libellés de cartes/détails sont T252.
- Étendre événements Codex, perception/pertes, consultation/archive, erreurs de chat Mac/TV,
  banc de surveillance TV et contrat du vrai client si ses champs consultés sont enrichis.
  Garder les priorités des messages de stockage/sauvegarde. Aucun changement de contrôle de
  capture, d'horloge, de file de questions ni de politique de quota globale.
- Écrire l'ADR de la cause persistée et de sa traduction à la frontière, lié dans
  `docs/architecture.md`, section Décisions. Élaguer les suppressions ESLint devenues inutiles.

## Critères d'acceptation

1. Un tour de description conduit par le vrai décodeur Codex échoue pour quota : l'erreur porte
   le code exporté et la reprise caractérisée. Un autre fil/tour ou une connexion remplacée
   ne modifie pas le passage courant. Les données non fiables ne classent rien.
2. Après transcription utilisable puis refus quota, le passage reste partiel, ses paroles sont
   consultables, `visionError` monte une fois et la perte vision porte la cause générique.
   Sans paroles, la perte totale suit les règles existantes. Aucun second appel ni faux succès ;
   débit, capacité et 401 gardent leur classification propre.
3. La cause et la reprise suivent le bon passage dans la consultation, `PassageLost` et l'archive
   jusqu'à sa réouverture. Une nouvelle session ne les hérite pas ; un passage réussi ne les
   efface pas. Corpus et anciennes clés restent compatibles, sans réécriture à l'ouverture.
4. Une question et une vérification de surveillance refusées pour quota affichent ce texte sur
   le Mac et la TV sans changement d'interface (`tests/chat-error-ui.test.cjs`, banc de surveillance
   TV). Avec/sans reprise et avec un diagnostic hostile, aucun message brut, URL ou HTML ne passe.
5. Le vrai client T038 garde ses comportements, dont le 304. Aucun champ existant, refus ou
   séquence de contrôle ne change ; aucun code Codex n'est persisté comme cause de Mémoire.
6. À l'implémentation, jouer en séquentiel `codex-session-events`, `split-perception`,
   `architecture-f08`, contrats de Mémoire/archive, `chat-error-ui`, surveillance TV et
   `wire-contract`, puis `node scripts/check.mjs`. Aucun test ou plancher affaibli.

## Test d'acceptation attendu

Ajouter `tests/perception-quota.test.cjs` pour la vraie chaîne notification Codex → perception →
Mémoire → consultation/archive/événement, avec RPC, temps et disque maîtrisés. Étendre
`tests/chat-error-ui.test.cjs` et `tests/tv-panel.test.cjs` pour observer le texte
rendu par les interfaces existantes. Le test des seules cartes de passages appartient à T252.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le schéma exact d'un refus quota de l'App Server, distinct du JSONL CLI du harnais, n'est pas
établi par les fichiers disponibles. Limiter la reconnaissance aux formes caractérisées et
consigner leur provenance ; une fixture supposée est nommée comme telle. Sans reprise fiable,
le message sans date s'applique. T227 est le dernier successeur de phase 1 des fichiers Mémoire.

## Journal

- 18/10, propriétaire : ticket hors du chemin GX10, repoussé après la copie B (T260). Son suivant T252 suit.
  Dépendance d'ordre ajoutée (`T260`), sans lien de code ; la retirer rend l'ordre par numéro.
- 18/10, propriétaire, sur l'avis d'Astra : la copie B (T259, T261, T260) et sa recette T280 passent avant ce
  ticket.
