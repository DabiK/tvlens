---
id: T177
titre: Handle or justify every empty catch in app, runtime, server and the TV app
statut: termine
bloque_par: T176
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les `catch` vides des hôtes, compositions et scripts de la page TV sont traités ou justifiés au
point où ils absorbent l'erreur. Le résultat indique ce qui échoue réellement, ce qui a déjà un
repli vérifié et les défauts plus larges restant en réserve. Le cliquet baisse sans changer sa règle.

## Sources

- `docs/audit-points-chauds.md`, section A « Cliquet », inventaire des catch vides.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Définition à `e92c6a6` : `scripts/quality/metrics.mjs:6`, `scripts/quality/metrics.mjs:10` et
  `scripts/quality/metrics.mjs:35`. Le relevé du code trouve **18 occurrences** dans `app/`,
  `runtime/`, `server/`, `tv/app/`, sur les 40 du produit. Les 16 des adaptateurs sont pour T176,
  les six du cœur appartiennent à T184, après T177. Aucun `catch` vide n'a été relevé dans `mcp/` à ce SHA.
  Les callbacks `.catch(() => {})` et le Python ne sont pas comptés par cette définition.
  La regex est textuelle : elle compte en revanche le callback classique
  `.catch(function () {})` de `tv/app/companion.js:613`, inclus dans les 18 occurrences.
- Inventaire vérifié, chaque fichier concerné et ses appelants/tests relus :

| Repère à `e92c6a6` | Opération protégée et suite actuelle |
| --- | --- |
| `app/main.cjs:103` | Enregistrement du raccourci ; l'hôte continue et expose l'absence d'enregistrement. |
| `app/main.cjs:545` | Accès aux candidats du binaire Codex ; la recherche continue puis rend `null`. |
| `app/renderer.js:608` | Lecture/parsing de préférences locales ; valeurs d'affichage par défaut. |
| `app/renderer.js:613` | Écriture des préférences ; l'objet en mémoire reste utilisé. |
| `runtime/headless-runtime.cjs:358` | `surveillance.tick()` ; les autres mises à jour du tick continuent. |
| `runtime/headless-runtime.cjs:1101` | Journal d'arrêt incomplet ; `lastEnd.errors` conserve déjà les erreurs. |
| `runtime/session-closing.cjs:131` | Journal de fermeture ; le résultat contient déjà les erreurs. |
| `runtime/surveillance-runtime.cjs:165` | Callback hôte de publication ; `toldAs` a déjà avancé avant son appel. |
| `server/http.cjs:177` | Parsing du corps ; le contrôle suivant rend 400 « JSON invalide. ». |
| `server/main.cjs:36` | Balayage des contextes périmés ; son refus ne bloque pas le démarrage. |
| `tv/app/ambient.js:46` | Fermeture de page retentée par une chaîne bornée. |
| `tv/app/ambient.js:72` | Indice de région de saisie optionnel. |
| `tv/app/ambient.js:75` | Indice de focus optionnel du profil passthrough. |
| `tv/app/ambient.js:179` | Effacement visuel avant départ ; le départ continue après une erreur. |
| `tv/app/companion.js:613` | Restauration de géométrie après délai d'ACK ; un refus final est quand même signalé. |
| `tv/app/companion.js:692` | Lecture des préférences overlay ; repli sur valeurs par défaut. |
| `tv/app/companion.js:794` | Sauvegarde de ces préférences ; le réglage mémoire continue d'être appliqué. |
| `tv/app/remote-client.js:56` | Corps vide ou non JSON ; le statut HTTP, puis l'erreur de réponse illisible, sont conservés. |

- Tests protecteurs : `tests/mac-ipc-contract.test.cjs`, `tests/architecture-f05.test.cjs`,
  `tests/architecture-f06.test.cjs`, `tests/architecture-f07.test.cjs:123` (logger qui lève),
  `tests/surveillance-runtime.test.cjs`, `tests/server-sessions.test.cjs`,
  `tests/server-ingest-path.test.cjs`, `tests/tv-panel.test.cjs`,
  `tests/tv-app-compat.test.cjs`, `tests/tv-ambient-params.test.cjs` et le banc
  `tests/helpers/tv-page.cjs`. La présence d'une garde statique de page ne prouve pas les exceptions.
- ADR 0005, 0006, 0007 et 0011 dans `docs/adr/` : possession, fermeture et forme des scripts TV.

## Périmètre

- Traiter seulement les occurrences encore présentes dans ces quatre répertoires au lancement,
  après les autres déplacements. Les lignes actuelles sont des repères ; suivre le comportement
  dans son module propriétaire si T149/T150, T167–T175 ou T179/T180 l'ont déplacé.
- Pour un refus déjà traduit en résultat, documenter cette traduction dans le `catch`. Pour une
  erreur facultative sans effet sur le service principal, écrire la raison précise de la poursuite.
  Toute petite gestion ajoutée doit avoir un test provoquant son refus, via l'interface publique.
- Examiner séparément `surveillance.tick` et le callback de publication : leur succès n'est pas
  établi en cas d'exception. Notamment, ne pas prétendre qu'une notification perdue après l'avancée
  de `toldAs` est sans conséquence. Si le défaut dépasse une petite gestion locale, nommer en réserve
  son effet, sa preuve et le travail requis, en explicitant la limite du comportement conservé.
- Les erreurs de fermeture déjà conservées restent accessibles même si le logger lève. Les
  préférences locales d'affichage peuvent garder leur repli ; ni une session ni un résultat réseau
  ne doivent être effacés pour résoudre une erreur de préférences.
- Ajouter les tests dans les fichiers des comportements concernés ou dans
  `tests/host-error-handling.test.cjs` ; utiliser le banc de page existant pour les erreurs de vue.
  Ne pas ajouter de garde du texte du produit à la place d'un test de comportement.
- Ne pas réintroduire ambient si T165–T182 l’ont supprimé : ses quatre occurrences ne demandent
  alors aucun remplacement. Ne pas déclencher ni réaliser cette suppression par ce ticket.
- Ne modifier ni `core/`, ni les adaptateurs, ni les règles métier, ni les historiques, ni les
  callbacks de rejet hors compteur, ni le harnais ou son plancher. Aucun accès TV/VPS ou fournisseur.

## Critères d'acceptation

1. Le journal rapproche chaque occurrence initiale d'un traitement existant documenté, d'une gestion
   nouvelle testée, d'une poursuite justifiée ou d'une suppression antérieure. Une réserve identifie
   tout effet non établi ; aucun « ignorer pour continuer » ne tient lieu de justification.
2. Une gestion nouvelle est exercée par une dépendance qui lève ou rejette. Le test observe résultat,
   état ou diagnostic et le travail suivant. Pour le JSON HTTP, un corps brut syntaxiquement invalide
   conserve le 400 actuel ; pour la TV, un 404 à corps vide conserve son statut et son refus, au lieu
   de devenir une erreur générique de parsing.
3. Le journal de fermeture rendu indisponible ne change pas le résultat contenant les erreurs.
   Pour les deux chemins de surveillance sensibles, les preuves et limites réelles sont consignées,
   et une petite correction éventuelle possède son test causal. Aucun défaut plus large n'est corrigé
   implicitement dans ce nettoyage.
4. Le relevé selon `emptyCatches`, inchangé, rend 0 pour chacun de `app/`, `runtime/`, `server/`,
   `tv/app/`. Aucun `catch` n'est déplacé ailleurs ou transformé en callback vide pour éviter le
   compteur. Noter les mesures initiale et finale ; retirer les 16 + 18 occurrences des deux tickets
   au seul SHA de départ laisserait **6**, pas 0, dans le produit.
5. Les tests des comportements touchés et leurs régressions passent sans assertion affaiblie ni test
   supprimé. Les contrôles sont séquentiels ; `node scripts/check.mjs` est vert à l'implémentation.
   La boucle resserre le plancher si nécessaire ; ce ticket `harnais: non` ne l'édite pas.

## Test d'acceptation attendu

Les tests appellent les hôtes, le protocole ou les vues par leurs frontières existantes, avec
logger, stockage local, callback ou réponse HTTP contrôlés. Le test de JSON passe par le serveur en
boucle locale ; le test TV pilote le vrai client ou la page minimale. Les simples commentaires sont
relus contre la conséquence observée, sans réclamer une preuve de panne sur une TV réelle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T176 implique T046, T031 et T150. L'ordre de la file ne fait pas de la suppression ambient un
prérequis : traiter le code encore actif, conserver les décisions qui la bloquent dans ses propres
tickets. Les exceptions de callback de surveillance et les pannes réelles de stockage local n'ont
pas été observées ici ; les constats viennent de la lecture, pas d'une exécution réussie des tests.

## Journal

### Exploration — 16 octobre 2026

- Consignes, standards, skills `ticket-codex` et `tests`, ADR 0005/0006/0007/0011 lus.
  Exploration et écarts : `.harness-state/tickets/T177/{exploration,ecarts}.md`.
- `git status --short`, `git diff`, `git log -5 --oneline` : base `253f7b7` ; modification
  initiale du statut du ticket et dossiers non suivis `design/continuous-context/`, `experiments/` préservés.
- Relevé par import de `emptyCatches` depuis `scripts/quality/metrics.mjs`, sur les fichiers JS/CJS/MJS
  de `PROD_DIRS` : `app=4`, `runtime=4`, `server=1`, `tv/app=4`, soit **13** ; produit **19**
  (`core=6`, adaptateurs et MCP à zéro). Définition du compteur inchangée.
- T165 (`e56a8ca`) a supprimé `ambient.js` et ses quatre occurrences ; T174 (`4109770`) a déjà
  justifié le parsing JSON dans `server/http.cjs`. Aucun remplacement de ces cinq repères.
- Choix : justifications locales et caractérisations avant édition, sans gestion nouvelle.
  Les tests ajoutés doivent être verts sur le comportement conservé ; aucun rouge fonctionnel revendiqué.
  Les deux limites de surveillance seront décrites avec leurs preuves et le travail requis.

### Caractérisations avant édition du produit

- Commande : `node --test --test-concurrency=1 --test-name-pattern='a failed (surveillance tick|end journal|shutdown journal|host publication)' tests/host-error-handling.test.cjs tests/surveillance-runtime.test.cjs`.
- Première exécution : 3 succès, 1 échec dans le nouveau test de publication : il attendait deux
  écritures alors que `flush()` retente lui aussi une écriture en échec (quatre tentatives observées).
  Ce n'était pas un défaut produit ni un test instable. Le test observe désormais la reprise des
  écritures et le comptage de leurs échecs, sans supposer que seul `tick()` écrit.
- Même commande après cette correction du nouveau test : **4/4**, avant toute édition du produit.
  Sorties : `.harness-state/tickets/T177/characterisation-before{,-corrected}.log`.
- Le tick hôte conserve l'actualisation quota/disque et retente le tick suivant malgré une exception.
  Le logger qui lève ne retire ni les erreurs de fin, ni celles d'arrêt de `lastEnd` ; une nouvelle
  session démarre après une fin dont le journal a échoué.
- Le callback de publication qui lève laisse le statut d'écriture consultable, mais sa notification
  est perdue et non retentée à l'échec d'écriture suivant. Un changement ultérieur vers `ready` est publié.

### Rapprochement des 18 repères initiaux

Les treize occurrences présentes à `253f7b7` portent désormais leur justification dans le bloc qui
absorbe l'erreur. Aucun changement des opérations, des retours, du compteur ou des politiques de reprise.
Les replis des préférences, des chemins Codex, du raccourci et du balayage sont établis par lecture ;
aucune panne matérielle ni faute de stockage de ces vues n'est revendiquée comme testée.

| Repère initial à `e92c6a6` | Propriétaire actuel et conséquence conservée |
| --- | --- |
| `app/main.cjs:103` | Même module : raccourci occupé, `shortcutRegistered=false` exposé par `viewing:get`, changement possible dans la bibliothèque. |
| `app/main.cjs:545` | Même module : candidat absent ou non exécutable, examen du suivant ; `null` à l'épuisement, disponibilité Codex exposée à la vue. |
| `app/renderer.js:608` | `loadPreferences` : stockage refusé ou JSON invalide, objet vide puis durée par défaut ; aucun état de session modifié. |
| `app/renderer.js:613` | `savePreferences` : durée déjà appliquée à la file et gardée en mémoire ; seule la persistance après rechargement est perdue. |
| `runtime/headless-runtime.cjs:358` | `tick` : quota et disque encore actualisés, prochaine tentative possible ; succès et intégrité du tick de surveillance non garantis (réserve ci-dessous). |
| `runtime/headless-runtime.cjs:1101` | `close` : erreurs déjà attachées à `lastEnd.errors`, résultat conservé malgré le logger qui lève (nouveau test). |
| `runtime/session-closing.cjs:131` | `closeSession` : erreurs et refus déjà dans `outcome`, encore rendus malgré le logger qui lève (nouveau test hôte et test existant du protocole). |
| `runtime/surveillance-runtime.cjs:165` | `publish` : registre consultable et écritures indépendantes ; notification perdue après `toldAs`, échec masqué au diagnostic du cœur (tests complétés après relecture, réserve ci-dessous). |
| `server/http.cjs:177` | Déjà justifié depuis T174 dans `readJSON` : le contrôle d'objet répond 400 `JSON invalide.` ; test HTTP existant avec le corps brut `{`. |
| `server/main.cjs:36` | Même module : le balayage des anciens arbres privés échoue sans bloquer la création de nouvelles sessions ; les arbres non retirés restent sur disque. |
| `tv/app/ambient.js:46` | Suppression antérieure par T165 (`e56a8ca`) ; aucun remplacement. |
| `tv/app/ambient.js:72` | Suppression antérieure par T165 (`e56a8ca`) ; aucun remplacement. |
| `tv/app/ambient.js:75` | Suppression antérieure par T165 (`e56a8ca`) ; aucun remplacement. |
| `tv/app/ambient.js:179` | Suppression antérieure par T165 (`e56a8ca`) ; aucun remplacement. |
| `tv/app/companion.js:613` | `changeLayout` : restauration non confirmée ; même après son refus, l'erreur finale de disposition remonte à la vue. |
| `tv/app/companion.js:692` | Lecture overlay : stockage refusé ou JSON invalide, valeurs par défaut, aucun état serveur modifié. |
| `tv/app/companion.js:794` | Sauvegarde overlay : choix mémoire conservé, déclaration au contrôleur et application par `overlay.tick()` encore tentées. |
| `tv/app/remote-client.js:56` | `read` : le refus HTTP conserve son statut malgré un corps illisible ; un succès sans valeur devient une réponse illisible. Test existant du vrai client : 404 à corps vide. |

### Nettoyage et premier contrôle

- Les contrôles rapides des huit fichiers produit ont d'abord refusé les suppressions ESLint
  `no-empty` devenues inutiles, comme prévu par les standards. Aucun contournement du hook.
- `node_modules/.bin/eslint --prune-suppressions app/main.cjs app/renderer.js runtime/headless-runtime.cjs runtime/session-closing.cjs runtime/surveillance-runtime.cjs server/main.cjs tv/app/companion.js tv/app/remote-client.js` : succès, sortie vide.
  Douze infractions `no-empty` élaguées ; le callback classique est compté par `emptyCatches` mais
  n'était pas une infraction ESLint `no-empty`. Aucun gel ajouté ni augmenté.
- `node scripts/check.mjs --changed` : **vert**, 18/18 tests dans les deux fichiers modifiés/ajoutés.
  Règles, format, lint, gel et cliquet verts ; sortie dans `.harness-state/tickets/T177/check-changed.log`.
- Mesures reproductibles : `node .harness-state/tickets/T177/measure.mjs --initial` (lecture de HEAD)
  et `node .harness-state/tickets/T177/measure.mjs` (arbre courant), sorties `measure-{initial,final}.log`.
  **app 4→0, runtime 4→0, server 1→0, tv/app 4→0 ; produit 19→6**.
  Les six restantes sont dans `core/`, hors périmètre. Plancher et définition inchangés.

### Réserves de surveillance

- **Tick partiel et sans diagnostic sur le headless.** Le test hôte injecte une exception à la frontière
  `surveillance.tick()` et prouve seulement que quota/disque continuent et qu'un tick ultérieur est
  tenté. La lecture de `createSurveillanceRuntime.tick()` montre que, si le cœur lève après avoir
  commencé, `writeIfDue()` n'est pas atteint. L'intégrité de cet état partiel et la reprise des
  échéances ne sont pas établies. Travail requis : définir un diagnostic observable et le contrat
  de reprise d'un tick partiel, puis l'exercer dans le cœur et sur les deux hôtes. Aucun succès de
  surveillance n'est déduit de la seule poursuite du tick headless. **Écart Mac, hors périmètre :**
  `app/main.cjs` appelle `surveillance.tick()` dans son intervalle sans garde. Une exception y remonte
  comme exception non interceptée du processus principal Electron, au lieu d'être absorbée comme
  sur le headless. Ce constat est établi par lecture ; aucune panne du processus Mac n'est exercée.
  Le travail sur le contrat de reprise doit aussi traiter cette différence entre les deux hôtes.
- **Notification perdue après `toldAs` et diagnostic masqué.** Le premier test provoque un refus d'écriture et fait lever
  le callback sur `write-failed`. Le prochain refus d'écriture est compté mais ce statut n'est plus
  notifié ; `snapshot()` reste exact et le retour à `ready` est publié. Ce test n'isole pas le catch
  de `publish` : le rejet final de `write()` pourrait également absorber cette exception.
  Le test ajouté après relecture fait lever le callback lors des publications du cœur : le registre
  continue à être traité et écrit, mais `snapshot().error` reste `null`. Sans le catch local, l'erreur
  atteint `Surveillance.emit()` puis `fail()` (rouge causal observé par mutation en mémoire).
  L'absence de diagnostic est donc aussi une limite conservée. Travail requis : définir un diagnostic,
  confirmation, reprise et bornage des publications en échec, y compris une diffusion partielle aux
  abonnés de l'hôte. Déplacer simplement `toldAs` ne prouverait pas la livraison. Comportement conservé
  et limite explicite, sans correction implicite du protocole de publication.

### Contrôle final et remise à la boucle

- `node scripts/check.mjs` : **vert**. Règles par fichier, format, lint, gel du lint et cliquet verts ;
  **1 399/1 399 tests JS**, 112 fichiers exécutés en séquentiel. Python : **33 tests, OK, 1 ignoré**.
  Bilan observé dans `.harness-state/tickets/T177/check-full.log`.
- Ce contrôle complet comprend les protections Mac/IPC, fermeture (ADR 0005/0006/0007), surveillance,
  sessions/ingestion/routes HTTP, client et panneau TV, compatibilité et navigation de page. Il valide
  notamment le corps brut JSON invalide à 400 et le 404 TV à corps vide, sans modification de ces tests.
- `git diff --check` : succès, aucune sortie. Aucun test existant supprimé ni assoupli ; quatre cas
  ajoutés. Aucun commit ni push. Aucun accès TV/VPS, fournisseur réel ou identifiant.
- Verdict : **TERMINÉ**, prêt pour la relecture de la boucle. Les deux réserves de surveillance
  ci-dessus décrivent le comportement conservé et restent dans le verdict ; aucune vérification
  matérielle n'est revendiquée. Le statut en tête du ticket reste géré par la boucle.

### Reprise après relecture 1 — cadrage

- Rapport `.harness-state/tickets/T177/relecture-1.md`, ticket/journal, écarts, `git status --short`
  et `git diff` relus ; travail présent conservé. Aucun écart ni contestation.
- Mineur accepté : le premier test de publication ne distingue pas le catch local de celui de
  `write()`. Ajout prévu d'un test distinct sur une publication du cœur, conservant toutes les
  assertions existantes ; mutation en mémoire pour observer le rouge causal, puis vert normal.
- Hors périmètre accepté en réserve : le tick Mac n'a aucune garde et son exception remonte au
  processus principal. Le comportement de poursuite du tick décrit plus haut est celui du headless.

### Reprise après relecture 1 — preuve et corrections

- Ajout, sans retirer ni assouplir une assertion, de
  `a failed host publication during core changes stays out of core errors while detection and persistence continue`.
  Le callback lève dès l'activation et pendant le traitement d'un passage. Le test observe
  `snapshot().error === null`, la poursuite de la détection/vérification et le résultat sourcé enregistré.
- **Rouge causal :** `node --require ./.harness-state/tickets/T177/mutate-publication.cjs --test --test-name-pattern='a failed host publication during core changes' tests/surveillance-runtime.test.cjs` :
  **1 échec sur l'assertion du diagnostic**, `publication refusée` au lieu de `null`, code de sortie 1.
  La mutation retire seulement le catch de `publish` en mémoire au chargement du module ; aucun fichier
  produit, cœur, adaptateur ou harnais n'est modifié. Sortie : `publication-mutation-red.log`.
- **Vert :** `node --test --test-name-pattern='a failed host publication' tests/surveillance-runtime.test.cjs` :
  **2/2**, code de sortie 0, module normal ; sortie `publication-green.log`. Le test initial conserve
  ses assertions sur la notification et les écritures ; le nouveau établit l'effet propre du catch.
- Commentaire local et réserve complétés : ce catch cache aussi l'échec du callback au diagnostic
  du cœur. La réserve distingue désormais le tick headless du tick Mac sans garde (constat hors
  périmètre conservé, aucune modification du comportement du tick Mac).

### Reprise après relecture 1 — contrôles et verdict

- `node scripts/check.mjs --changed` : **vert**, **19/19 tests JS**, règles/format/lint/gel/cliquet
  verts ; sortie `check-changed-correction-1.log`, code de sortie 0.
- `node scripts/check.mjs` : **vert**, **1 400/1 400 tests JS**, 112 fichiers en séquentiel ;
  Python : **33 tests, OK, 1 ignoré**. Règles, format, lint, gel et cliquet verts ; sortie
  `.harness-state/tickets/T177/check-full-correction-1.log`, code de sortie 0.
- `node .harness-state/tickets/T177/measure.mjs` : **app=0, runtime=0, server=0, tv/app=0**,
  produit **6** ; sortie `measure-final-correction-1.log`. Aucun changement de la définition du compteur.
- `git diff --check` : succès, aucune sortie. Cinq tests ajoutés au total depuis HEAD, sans retrait
  ni assouplissement ; aucun changement de logique produit. Aucun commit ni push.
- Constat 1 (mineur) : **corrigé**, preuve causale supplémentaire et diagnostic masqué documenté.
  Constat 2 (hors périmètre) : **réserve explicite** dans le journal et le nouveau verdict,
  comportement du tick Mac conservé. Aucun constat mineur ou bloquant laissé sans correction.
- Nouveau verdict : **TERMINÉ**, à remettre à la boucle pour relecture.

### Réserves à la clôture

- Réserve autorisée : sur le headless, le catch du tick permet la suite quota/disque et le prochain appel, prouvés par injection. Un tick partiel dans le cœur, ses effets et sa reprise ne sont pas garantis ; writeIfDue est sauté si le cœur lève. Définir diagnostic et contrat de reprise dans un travail distinct, puis tester le cœur et les deux hôtes.
- Constat 2 de relecture, hors périmètre : app/main.cjs appelle surveillance.tick() dans setInterval sans garde. Une exception y remonte comme exception non interceptée du processus principal Electron, contrairement au headless. Établi par lecture, sans panne Mac exercée. Intégrer cette différence au travail sur le contrat de reprise ; aucune correction du tick Mac dans ce ticket.
- Réserve autorisée : toldAs avance avant la publication hôte ; son échec perd la notification et le même statut de persistance n'est pas renotifié. Le catch de publish masque aussi l'échec au diagnostic du cœur : snapshot().error reste null, ce que le nouveau test et sa mutation établissent. Le registre reste consultable et les écritures continuent. Définir un diagnostic, la confirmation, une reprise bornée et la livraison partielle des notifications dans un travail distinct.
- .harness-state/tickets/T177/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
