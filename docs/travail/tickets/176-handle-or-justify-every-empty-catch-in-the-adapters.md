---
id: T176
titre: Handle or justify every empty catch in the adapters
statut: a-faire
bloque_par: T046, T031
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Chaque `catch` vide des adaptateurs reçoit une gestion vérifiée de son erreur ou un commentaire
précis expliquant pourquoi la poursuite est acceptable. Les véritables défauts dépassant une petite
correction sont nommés en réserve avec leur conséquence ; ils ne sont pas masqués par une
justification générique. Le compteur du cliquet baisse sans changer sa définition ou son plancher.

## Sources

- `docs/audit-points-chauds.md`, section A « Cliquet », inventaire des catch vides.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Définition à `e92c6a6` : `scripts/quality/metrics.mjs:6` donne les répertoires de production ;
  `scripts/quality/metrics.mjs:10` contient la regex `catch` à corps composé d'espaces seulement ;
  `scripts/quality/metrics.mjs:35` la compte. Le plancher maximal enregistré est 40,
  `scripts/quality/baseline.json:4`. Le relevé statique de ce SHA retrouve 40 occurrences au total,
  dont **16 dans `adapters/`**, sur 15 lignes physiques ; les callbacks `.catch(() => {})` ne sont
  pas comptés par cette définition.
- Inventaire relu en entier avec les appelants/tests concernés, repères à `e92c6a6` :

| Repère | Opération protégée et suite actuellement visible |
| --- | --- |
| `adapters/chat-trace.cjs:42` | Écriture stderr ; un échec du diagnostic ne remonte pas. |
| `adapters/codex-confinement.cjs:261` | Accès et liens des fichiers facultatifs ; absence et refus de lien sont aujourd'hui confondus. |
| `adapters/codex-confinement.cjs:306` | Examen/suppression d'un candidat périmé ; le balayage continue avec les suivants. |
| `adapters/codex-rpc.cjs:17` | Allocation pour l'attente synchrone à la sortie ; sans elle, cette attente est sautée. |
| `adapters/codex-rpc.cjs:67` | Parsing et réception d'une ligne ; T046 doit séparer JSON invalide et exception du gestionnaire. |
| `adapters/codex-rpc.cjs:74` | Envoi secondaire d'une réponse d'erreur devenu impossible. |
| `adapters/codex-session-client.cjs:56` | Diagnostic stderr du client. |
| `adapters/codex-session-client.cjs:228` | `thread/unsubscribe` levant synchroniquement ; la rotation continue. |
| `adapters/codex-session-client.cjs:733` | Lecture quota levant synchroniquement ; le tour continue. |
| `adapters/codex-video-agent.cjs:33` | Deux occurrences distinctes : SIGTERM puis SIGKILL lors de l'abandon d'une exécution héritée. |
| `adapters/embedding-store.cjs:17` | Lecture/parsing du cache ; repli sur un cache vide. |
| `adapters/local-vlm-agent.cjs:14` | Parsing d'URL ; validation de configuration explicite juste après. |
| `adapters/local-vlm-agent.cjs:47` | Transport local ; transformation en erreur stable ou raison d'abandon. |
| `adapters/remote-media.cjs:115` | Échec d'attachement de `cleanup` ; l'erreur primaire reste prioritaire. |
| `adapters/saved-moment-store.cjs:11` | Lecture d'un élément gardé illisible ; cet élément est omis de la liste. |

- Tests protecteurs : `tests/chat-trace.test.cjs`, `tests/codex-confinement.test.cjs`,
  `tests/codex-thread-rotation.test.cjs:228` (quota), `tests/codex-stream-decoding.test.cjs`,
  `tests/local-vlm-agent.test.cjs`, `tests/moment-index.test.cjs`,
  `tests/architecture-f06.test.cjs:479` (nettoyage média), `tests/viewing-features.test.cjs`,
  `tests/session-delete.test.cjs`, `tests/chat-codex.test.cjs`, et les tests apportés par T046.
  Plusieurs couvrent le chemin nominal seulement : leur présence ne prouve pas que le refus est testé.

## Périmètre

- Modifier seulement les occurrences encore présentes dans `adapters/`, y compris celles déplacées
  dans ce répertoire par un refactor précédent. Refaire l’inventaire au début : T046 traite la
  frontière JSON/gestionnaire de `adapters/codex-rpc.cjs:67` et garantit au plus deux `catch` vides
  restants ; ceux des lignes 17 et 74 restent à inventorier ici. T175 peut déplacer ceux du client ;
  T139 peut retirer le
  client hérité. Une occurrence supprimée par un prédécesseur n'est pas recréée pour ce ticket.
- Pour une erreur déjà transformée ou conservée ailleurs, documenter précisément ce chemin. Pour une
  opération facultative sans conséquence sur le résultat, écrire la raison **dans** le `catch`.
  Pour une petite gestion nouvelle, utiliser les canaux d'erreur existants et ajouter un test qui
  provoque le refus ; aucun chemin interne ni donnée sensible ne doit être ajouté aux réponses.
- En particulier, la lecture quota est informative ; un diagnostic qui échoue ne doit pas faire
  échouer le tour. Le défaut de gestionnaire RPC appartient à T046. Les liens de confinement,
  les signaux de processus et l'omission d'un élément illisible demandent une justification fondée
  sur leur contrat, pas « erreur ignorée » ou « best effort » sans explication.
- Si un défaut demande une correction plus large, le journal et les réserves de clôture nomment
  fichier, opération, conséquence, preuve manquante et travail requis. Ne pas affirmer que l'erreur
  est sans effet si cette propriété n'est pas établie ; conserver explicitement le contrat courant
  et sa limite, sans ouvrir un refactor du confinement, du stockage ou des processus.
- Tests : compléter les fichiers des comportements concernés, ou créer
  `tests/adapter-error-handling.test.cjs` pour les coutures non couvertes. Aucun nouveau test ne
  compare le texte du produit pour se substituer à une preuve de comportement.
- Ne modifier ni `core/`, ni les hôtes, ni les callbacks de rejet non comptés par le cliquet, ni les
  historiques, ni le harnais ou le plancher. Pas de nouvelle politique métier ou de dépendance npm.

## Critères d'acceptation

1. Le journal rapproche toutes les occurrences de l'inventaire initial de l'un de ces résultats :
   traitement existant documenté, gestion nouvelle testée, poursuite justifiée, ou disparition par un
   prédécesseur. Chaque justification cite la conséquence évitée et ce qui prend déjà en charge le
   refus ; toute limite restante est une réserve nommée. Aucun commentaire générique ne suffit.
2. Toute gestion nouvelle est exercée en provoquant l'erreur à la frontière publique du module,
   avec disque/transport/logger doublé. Le test vérifie l'erreur remise, l'état ou le diagnostic
   attendu, et la poursuite ou le refus du travail suivant. Aucun vrai fournisseur ni signal vers
   un processus externe au test n'est utilisé.
3. Le relevé selon la définition inchangée de `emptyCatches` rend 0 dans `adapters/`, sans déplacer
   un `catch` vide hors de ce périmètre ni le convertir en callback vide pour éviter le compteur.
   Consigner le total global et le détail avant/après. Sur le code de départ seul, retirer ces
   16 occurrences ferait passer le total de 40 à 24 ; le lancement doit remesurer les prédécesseurs.
4. Les comportements de rotation, quota, confinement, priorité de l'erreur média, lecture des
   caches et liste des moments restent protégés par leurs tests existants, sans en affaiblir ni
   retirer une assertion. Les tests ajoutés échouent si leur nouvelle gestion est temporairement
   retirée ; consigner un rouge causal puis rétablir le code.
5. Exécuter les fichiers concernés en séquentiel, puis `node scripts/check.mjs` à l'implémentation.
   Le cliquet baisse ; son resserrement éventuel appartient à la boucle, sans édition du harnais
   par ce ticket `harnais: non`.

## Test d'acceptation attendu

Les tests du module dont la gestion change provoquent le refus par ses dépendances contrôlées et
observent sa méthode publique. Pour les seules justifications de comportement inchangé, conserver
les tests existants et leur portée réelle ; ne pas annoncer qu'un commentaire prouve une absence
de défaut. Le relevé du compteur vérifie la couverture de l'inventaire, pas la sûreté du comportement.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T046 et T031 attendent T150 et apportent respectivement la propagation des fautes et le lint.
Le choix accepté ici est de rendre explicites les traitements existants et de corriger seulement
les petits défauts établis. Aucune preuve de panne réelle de lien, de signal ou de cache sur la
machine de l'utilisateur n'est disponible ; une autre politique de propagation reste hors périmètre.
T177 poursuit sur les hôtes et la TV ; T184, qui dépend de T177, possède les six occurrences du cœur.

## Journal
