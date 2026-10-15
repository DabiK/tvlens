---
id: T177
titre: Handle or justify every empty catch in app, runtime, server and the TV app
statut: a-faire
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
