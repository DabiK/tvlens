---
id: T239
titre: Close delete and quit Mac sessions through the coordinator
statut: a-faire
bloque_par: T238
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: critique
---

## Ce que le ticket livre

La fin, la suppression et le départ de l'application Mac suivent le même coordinateur que le
serveur. Les obligations sont appelées explicitement et leur résultat distingue archive confirmée,
scellement et déchargement effectif, y compris en cas d'échec, selon les faits livrés par T250.

## Sources

- `docs/domaine.md`, sections 3 Bibliothèque, 6 règle 9 et 10 ; ADR 0030 amendant 0007.
  T234 fournit le contrat commun ; T236 son implémentation, T237/T238 les transitions Mac déjà migrées.
- Code vérifié à `1d8aa48` : `app/main.cjs:353` orchestre la fin ; `:355` lève switching,
  `:358` annule la recherche, `:368` révoque MCP avant attente. Les étapes Mac à `:370` à `:378`
  diffèrent de l'ordre serveur `runtime/headless-session-lifecycle.cjs:153` à `:164`.
- `app/main.cjs:381` lâche la session, `:394` transmet un refus et `:399` publie toujours le
  reset. `:454` porte nouvelle session, `:503` suppression, `:580` intercepte le départ de l'application.
- `runtime/session-closing.cjs:73` lève la fin, `:79` tente chaque étape, `:90` archive ou
  scelle ; `:106` libère l'hôte avant l'effacement à `:121`. Un échec de libération conserve le dossier.
- `runtime/session-lifecycle.cjs:65` libère les ressources de session ; `:118` confirme par
  barrière puis manifeste ; `:157` scelle store et vecteurs. Ces responsabilités restent distinctes (ADR 0020).
- Tests lus : `tests/architecture-f07.test.cjs:69`, `:148`, `:502`, `:538` et `:558`,
  `tests/mac-ipc-contract.test.cjs:867`, `:903`, `:1045`, session-delete et session-lifecycle.
  La garde de forme finale de F07 (`tests/architecture-f07.test.cjs:585`) vise encore les deux anciens appelants.
  `tests/architecture-f07.test.cjs:280` fixe l'ordre Mac, `:183` celui du serveur, comparés par `:463`.

## Périmètre

- Modifier les appels Mac, ses étapes déclarées par la composition de `app/`, le coordinateur/protocole
  si leur raccord l'exige, et les tests de fin. `watch:new`, `sessions:delete` et la fin de session
  à quitter n'orchestrent plus de liste d'étapes dans `main.cjs`.
- Adopter l'ordre commun serveur de l'ADR 0030 et intégrer explicitement les étapes Mac :
  révocation MCP, annulation de recherche, détachement/réinitialisation du résumé et arrêt de
  son adaptateur. La fin bloque l'admission et invalide les préparations concernées avant toute
  première attente ; les questions sont annulées et leur sauvegarde finale engagée selon T234.
- Les abonnements de résumé/surveillance et projections livrés après T227 ne remplacent aucune
  obligation. Une analyse qui termine pendant la fin ne réamorce pas de résumé ni d'écriture de chapitres.
  Les stockages admis atterrissent entiers ; le cycle ADR 0020 garde révocation, ressources et barrières.
- Tenter toutes les étapes et conserver chaque échec nommé. Exploiter le résultat T250 via le contrat T234 et le coordinateur T236 :
  un échec obligatoire ne devient pas une fin réussie. `archived` reste un fait disque distinct
  de la réussite globale ; ne pas le déduire du seul manifeste ni du reset de la fenêtre.
- Garder la règle commune de session vide avec `fresh` (T191) et la suppression explicite seule.
  Rien n'est effacé sans scellement et libération ; une libération refusée reste un refus visible
  au demandeur avec la session encore tenue selon le contrat. Aucun effacement pour débloquer une file.
- Le départ de l'application conserve minuteries, raccourcis et vérification manuelle comme ressources
  d'hôte ; sa session passe par la même fin. Fermer encore surveillance et pont MCP si une étape
  échoue, sans fermer une ressource deux fois ni dépendre d'une publication réussie.
- Retirer la couture de fin et d'adoption de T237 dès que la fin Mac passe par le coordinateur.
- Si le contrôle de forme `tests/architecture-f07.test.cjs:585`, ou celui que T236 a mis à sa place,
  exige encore que `app/main.cjs` appelle `closeSession`, le remplacer par une preuve passant
  par le coordinateur réellement composé,
  en conservant les scénarios de panne et les autres gardes. Compléter l'ADR créé par T236,
  son explication dans `docs/architecture.md` si nécessaire ; pas de nouveau document sans lien.
  Élaguer les suppressions ESLint devenues inutiles. Aucun changement de harnais ni de format.

## Critères d'acceptation

1. Le contrat T234 s'exécute pour le vrai raccord Mac : admission fermée, préparations invalidées,
   MCP révoqué et nouvelles questions refusées avant la première attente retenue. Les questions
   sont annulées puis remises au store avant archivage/scellement, à leur place dans l'ordre serveur.
   Un nouvel appel MCP ou bloc ne se glisse pas dans cette attente ; le serveur garde la même preuve.
2. Refuser chaque étape obligatoire séparément laisse les autres tentées et rend une fin incomplète,
   sans succès global trompeur. Le résultat et le journal conservent les erreurs ; un refus de
   sauvegarde ou de manifeste ne donne jamais `archived:true`. Les trois faits de T250 restent distincts.
3. Nouvelle session, ouverture d'une autre archive, suppression chargée et départ de l'application suivent
   ces mêmes obligations. Une fin répétée partage son travail selon le contrat, sans double fermeture.
   Une archive vide préexistante est gardée ; une session fraîche réellement vide reste supprimable.
4. Refuser scellement, effacement ou libération n'annonce pas une suppression faite. Aucun dossier
   voisin ou moment gardé ne change ; aucune écriture tardive ne recrée la session supprimée.
   Après une panne réparable, une nouvelle tentative peut aboutir sans refermer les ressources déjà libérées.
5. Une recherche ou réponse tardive de A n'agit pas sur B. La fenêtre reçoit les notifications du
   contrat, et un reset ne tient jamais lieu de preuve d'archivage ou de déchargement réussi.
6. À l'implémentation, jouer en séquentiel le contrat T234, `tests/headless-session-lifecycle.test.cjs` (ou le fichier
   du coordinateur nommé au journal de T236),
   architecture-f07, mac-ipc-contract, server-sessions, session-delete et session-lifecycle,
   puis `node scripts/check.mjs`. Aucun test ou plancher supprimé ni garantie d'ADR affaiblie.

7. `tests/architecture-f07.test.cjs:463` attend pour le Mac l'ordre serveur de `:183`, les étapes
   Mac déclarées (contextes MCP, recherche, résumé) à la place fixée par l'ADR de T236 ; seule
   cette attente change, par décision de l'ADR 0030. Le contrat T234 retire les écarts Mac
   désormais résolus, sans changer les autres preuves de panne ou de durabilité.

## Test d'acceptation attendu

Conduire la fin par le vrai preload, avec un store temporaire et des ressources retenues séparément.
Le contrat commun observe l'entrée des obligations avant libération des promesses, puis injecte
leurs refus. Conserver les preuves de disque/barrière et de scellement des suites existantes.
Le banc de départ de l'application reste sous Electron simulé ; aucune TV ni application native n'est lancée.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les restrictions de non-fusion de T191/T192 sont levées par l'ADR 0030 ; leurs règles et preuves
restent obligatoires. T238 implique T227 et les modifications de phase 1 des mêmes fichiers.
Le contrat T234 et les noms réels du résultat T250 sont à relire : ils ne sont pas réputés présents
à `1d8aa48`. Un manque de garantie non résolu par ces prérequis se signale avant migration.

## Journal
