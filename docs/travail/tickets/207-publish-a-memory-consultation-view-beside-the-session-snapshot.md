---
id: T207
titre: Publish a memory consultation view beside the session snapshot
statut: a-faire
bloque_par: T194, T205
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

`MemoryView` publie le contrat de lecture de la Mémoire à côté du snapshot existant : identité,
horloge, passages révisés, modalités connues, disponibilité, couverture et pertes. La composition
expose séparément les capacités de lecture média et leurs baux, utilisables par les futurs lecteurs.

## Sources

- `docs/domaine.md`, sections 3 Mémoire, 6, 9 et 11 ; ADR 0029/0030. T194 retire les chemins morts
  après T193/T190 tout en conservant les questions historiques. Relire ses champs et tests livrés.
  T205 est ajouté au plan : ce nouveau module crée ou complète `core/memory/`, avant les voies de T214.
- Code vérifié à `dd5efc9` : `core/session.cjs:489` rassemble état, horloge, listes, pertes et
  couverture ; `:438` restaure ; `:145` et `:192` changent disponibilité sans révision supplémentaire
  aujourd'hui. T221 étendra ces révisions ; ce contrat n'anticipe pas qu'il est déjà livré.
- Les sept familles ci-dessous sont des usages, pas sept appels uniques. Hors de cette matrice,
  `core/saved-moments.cjs:4`, `app/moment-actions.cjs:9` et le cycle de vie lisent aussi des états.
  Aucun de ces lecteurs ne migre ici.

  | Famille et repère vérifié | Besoin réel à couvrir |
  | --- | --- |
  | Surveillance, `runtime/surveillance-runtime.cjs:259`, `core/surveillance.cjs:429` | Identité/horloge, ordre, intervalle, états audio/vision et textes propres au passage ; relecture après visuel, aucun résumé cumulatif de sujet |
  | Résumé vivant, `core/living-recap.cjs:47` | Passages ready, textes, intervalles, disponibilité, attentes, pertes et trous ; history reste non rejouable |
  | Questions, `core/video-tools.cjs:17`, `:31`, `:100`, `:157`, `:162` | Identité, horloge et préfixe à figer ; révisions consultées, erreurs, trous, raisons média et baux ; lecture fraîche sans élargir les bornes |
  | Frise/détail, `core/session-timeline.cjs:10`, `:72` | Ordre, sujet/continuité/résumé de sujet, statuts, transcription, erreurs, miniature et disponibilité |
  | Index, `runtime/session-providers.cjs:201` | Queue des 48 segments récents, observation utilisable et texte résumé/visuel/transcription ; pas uniquement ready |
  | Manifeste, `runtime/session-manifest.cjs:27`, `:77` | Totaux history + segments, médias rejouables parmi segments, horloge, rétention et premier sujet ; octets apportés par la composition |
  | Vues TV, `runtime/state-views.cjs:17`, `:201` | En-tête autorisé, couverture, pertes, derniers passages, indisponibilités et frise ; stockage et surveillance restent des apports séparés |

- `runtime/conversation-runtime.cjs:37` assemble les outils avec snapshot figé et lecteur live ;
  `core/video-tools.cjs:162` acquiert le bail. `adapters/local-store.cjs:82` lit images/son et
  `:105` protège leurs fichiers ; `adapters/clip-inspector.cjs:27` utilise un chemin média en interne.
  Les ports de lecture ne doivent pas exposer ce chemin aux autres domaines.
- Tests lus : split-perception, evidence-refresh, video-research, session-timeline, session-providers,
  session-manifest, session-lifecycle, session-durable, surveillance, living-recap et server-state-views.
  ADR 0004 : outils et baux restent possédés jusqu'au retour effectif ; ADR 0002/0003/0008 conservés.

## Périmètre

- Créer `core/memory/memory-view.cjs`, son entrée `core/memory/index.cjs` et les types JSDoc de
  `MemoryView`/lecture média. Ajouter une lecture publique à `WatchSession` et la composer dans
  `runtime/session-runtime.cjs`, avec des capacités liées à cette session. La vue ne rappelle pas
  `snapshot()` ; elle se construit depuis les données de Mémoire, sans I/O ni fournisseur.
  Ajouter aussi deux lectures bornées : un passage par identifiant, et les N derniers passages
  de `segments`, sans construire la vue complète.
- Déclarer `core/memory/**` et les permissions exactes de ses consommateurs dans la garde de T205.
  Si un autre ticket l'a déjà créée, enrichir sa ligne et son index existants. Le code plat encore
  propriétaire de la Mémoire passe par cette entrée, sans faire importer `core/session.cjs` au module.
  Aucun autre contexte du domaine ne reçoit un droit général à ses modules internes.
- Publier des valeurs détachées : session et horloge ; passages dans l'ordre, identités/intervalles,
  révision, observation et résumé de sujet, statuts/erreurs de voies, miniatures ; disponibilité et
  raisons historiques `expired`, `missing`, `not-kept`, `unreadable` ; couverture et pertes distinctes.
  Garder l'information qui permet de distinguer history et passages avec média conservé, sans
  imposer aux futurs lecteurs de connaître les deux tableaux internes.
- Décrire les modalités connues sans confondre « son absent », « transcription échouée » et « vidéo
  non rejouable mais images conservées ». Pour un ancien passage sans métadonnée suffisante, publier
  l'inconnu explicitement, sans inventer audio ou vidéo à partir d'un statut ready. Les informations
  d'entrée peuvent être suivies en mémoire ; aucun champ persisté nouveau n'est imposé ici.
- Exposer par la composition un port de lecture images/son et `lease(ids)` avec libération idempotente,
  adossés au vrai store. Pas de chemin disque, mutateur d'agrégat, sauvegarde, suppression ou Response
  HTTP dans la vue de domaine. Recherche et inspection restent des services distincts déjà injectés.
- Écrire un ADR court et `tests/memory-view.test.cjs` pour figer le contrat et sa matrice de besoins.
  Aucun lecteur actuel ne migre, aucune projection `/v1`, aucun nom historique ni format disque ne
  change ; conserver `snapshot()` et la compatibilité des questions historiques de T194.
  Les nouveaux fichiers arrivent sans infraction gelée ; aucun contournement de garde ou nouveau timer.

## Critères d'acceptation

1. Le test public de contrat compare les clés et types annoncés pour session vide, audio publié,
   visuel prêt, perte de voie et history. Il couvre les besoins de chaque famille de la matrice,
   sans exiger qu'elle consomme déjà cette API. Il vérifie identité, ordre et révision conservés.
2. Modifier les listes, observations ou résumés d'une vue obtenue ne modifie ni la Mémoire ni une
   autre vue. Une lecture n'émet, n'écrit, n'analyse rien et n'ouvre aucun média.
   La construction de vue est possible même si le banc interdit l'appel au snapshot complet.
   Un espion du banc prouve que ces lectures bornées ne construisent pas la vue complète.
3. Les raisons de non-rejeu restent distinctes. Une vidéo unreadable peut encore donner des images
   conservées ; une transcription en erreur n'est pas déclarée silence. Une archive sans indicateur
   de modalité reste inconnue ; un passage de history n'est jamais annoncé retrouvé.
4. Le contrat permet de figer identité, ancrage et ensemble des passages d'une question, puis de
   relire un passage plus récent sans ajouter un passage arrivé après la question. Un trou et les
   bornes disponibles sont représentables ; les tests d'evidence-refresh existants restent inchangés.
5. Par la composition et le vrai store temporaire, une suppression demandée pendant un bail
   (`store.remove(id)`, pas `prune()`) n'a lieu qu'à sa libération, et un bail demandé pendant que
   cette suppression attend est refusé (`adapters/local-store.cjs:96`, `:110`). La preuve ne dépend
   pas de la rétention glissante, que T223 retire. Après fin de l'usage, il est rendu une fois ; un média absent
   refuse le bail sans fuite. Aucun port de domaine n'expose chemin local ni statut HTTP.
6. Le snapshot, les documents sur disque et les réponses des consommateurs actuels conservent leur
   contrat. À l'implémentation, exécuter en séquentiel memory-view, evidence-refresh, video-research,
   session-durable, session-lifecycle, server-state-views et architecture, puis `node scripts/check.mjs`.
   Aucune suppression de test ni hausse du gel.

## Test d'acceptation attendu

`tests/memory-view.test.cjs` consulte le vrai cœur puis la capacité publique de `createSessionRuntime`,
avec médias temporaires, fournisseurs et horloges maîtrisés. Le contrat porte sur des données et
des capacités observées, pas sur un alias du snapshot ou une comparaison de sources.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les modalités historiques exactes ne sont pas déductibles pour tous les passages : l'inconnu fait
partie du contrat de lecture. La forme détaillée des types est technique et doit être reliée aux
lecteurs inventoriés. T221 peut précéder ou suivre ce ticket ; reprendre son contrat de révision
s'il est livré, sans créer un second compteur. La création de la sous-zone ici avance celle annoncée
par le plan en T214 ; T214 la complétera pour les voies, sans la recréer.

## Journal
