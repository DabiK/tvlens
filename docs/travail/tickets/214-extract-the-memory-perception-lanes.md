---
id: T214
titre: Extract the memory perception lanes and their generic vision hold policy
statut: a-faire
bloque_par: T221, T207
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les files audio et vision ont un propriétaire dans `core/memory/lanes.cjs`. Leur ordre, leurs
bornes, leurs pertes et leur unique nouvel essai restent observables par l'ingestion de session.
La retenue vision devient une politique générique, indépendante des questions.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire), 6 à 9 et 11 ; ADR 0029/0030.
  Garanties obligatoires : ADR 0002/0003 (durabilité et publication), 0006/0023 (ingestion possédée),
  0004 (outils encore retenus) et 0008 (un seul nouvel essai vision).
- Code vérifié à `dd5efc9` : `core/session.cjs:159` borne l'audio encore transcrivable à `maxPending`
  et la file de références à trois fois cette borne ; `core/session.cjs:171` distingue retenue et
  encombrement ; `core/session.cjs:179` conserve l'ordre du transfert vers la vision.
- `core/session.cjs:271` possède l'audio ; `core/session.cjs:305` publie les paroles et démarre la
  vision avant le drainage des passages suivants. `core/session.cjs:313` décide du nouvel essai ;
  `core/session.cjs:345` relit le média puis revérifie les conditions avant le second appel.
- `core/session.cjs:79` mesure la retenue ; `core/session.cjs:320` ne la compte que lorsqu'elle
  est seule à retenir la voie. `core/session.cjs:380` annule les appels à la fermeture.
- Appelants : `runtime/session-runtime.cjs`, `runtime/session-lifecycle.cjs`,
  `runtime/session-closing.cjs`, `app/main.cjs`, `runtime/headless-runtime.cjs` et simulateurs.
  Tests lus : split-perception, session-latency, architecture-f08, watch-session-ending et
  session-lifecycle sous `tests/`, suffixe `.test.cjs`.
- État attendu : T194 a retiré voie série, ancien `ask` et déclaration d'images masquées après
  T193 ; T190 a donné à la session `setQuestionPending`. T186/T206/T221 isolent les publications
  après état rétabli. T205 fournit points d'entrée et exceptions. Relire ces livraisons avant
  extraction ; ne pas transporter les chemins historiques supprimés par T194.

## Périmètre

- Créer `core/memory/lanes.cjs` et son exposition strictement nécessaire dans
  `core/memory/index.cjs`. Le propriétaire des voies tient leurs files de références, les appels
  en cours, le drainage, le transfert, la retenue et la décision de nouvel essai. La racine reste
  propriétaire des passages, de leur identité et de leurs transitions publiées/persistées.
  Injecter les ports et les lectures nécessaires, sans objet hôte ni accès global à la machine.
- Extraire seulement les deux voies actives : `shed`, `skipVision`, `toVision`, drainage audio et
  vision et leurs aides. Ne pas déplacer rétention, restauration, calcul de couverture ou cycle
  de vie ; ils ont leurs tickets. Ne pas recopier les règles dans les callbacks de la façade.
- Remplacer la cause technique de retenue par une commande générique, par exemple retenir/libérer
  la vision. La façade `setQuestionPending` de T190 traduit encore activité et `visionDuringAsk`
  dans la racine, puis délègue aux voies sans redonner les files aux hôtes. T227 sortira cette
  traduction de la racine ; ce lot ne la déplace pas déjà dans le runtime.
  Le nouveau module ne nomme ni question, ni `DeepAsk`, ni surveillance.
- Garder les noms historiques `asking`, `visionSkippedAsking`, `visionBlockedMs` et la valeur de
  cause `asking` aux frontières publiées/persistées. Leur traduction ne doit pas recréer une règle
  de question dans les voies. Le retrait de la façade de vocabulaire appartient à T227.
- Compléter la ligne de sous-zone `core/memory/**` et l'entrée publique créées par T207, avec
  les consommateurs exacts nécessaires selon T205. Les éventuelles arêtes vers les helpers encore
  plats sont des exceptions nommées, avec fichier, arête et raison ; aucune permission générale
  vers les autres contextes. Le nouveau module n'utilise aucun accès global au temps ; le stock de T202 ne change pas.
- Le propriétaire des voies expose le retrait d'un passage des deux files, avec la fin de
  retenue. L'élagage l'appelle tant que la rétention existe, et ne touche plus aux files
  (`core/session.cjs:202-213`, `:208`). `close()` (`:382`) et les comptes publiés (`:493`) passent
  aussi par ce propriétaire. `tests/session-latency.test.cjs:176` et `:335` restent verts.
- La politique générique couvre aussi `closeIntake()` (`core/session.cjs:91`) et le verrou de
  fermeture serveur (`runtime/headless-runtime.cjs:126`, conservé par T190) ; `asking` publié,
  la cause `asking` (`core/session.cjs:172`) et le refus du second essai (`:314`) restent identiques
  pendant une fermeture. La racine garde sa façade de question jusqu'à T227.
- Le code déplacé est corrigé de ses infractions avant d'arriver dans le nouveau fichier.
  Élaguer `eslint-suppressions.json` sans déplacer ni augmenter son stock. Ajouter un ADR court
  sur la propriété des voies et la traduction de politique, en citant les ADR conservés.

## Critères d'acceptation

1. Par l'ingestion publique, audio et vision avancent indépendamment, avec au plus un appel par
   voie. Les références en attente sont bornées ; chaque saut est compté et conserve les paroles
   déjà disponibles. Le passage transcrit garde sa place devant ceux dont l'audio a été écarté.
2. Un passage sans paroles ne chasse pas un passage parlé d'une file vision pleine. Les pertes
   dues à une voie occupée restent des pertes d'encombrement, même pendant une retenue demandée.
3. Retenir la vision laisse l'audio avancer ; libérer la retenue termine exactement sa mesure et
   reprend la même instance, comme T190. Une politique autorisant la vision pendant l'activité
   des questions conserve le comportement actuel. Aucun hôte n'affecte les files ou drapeaux.
4. L'ADR 0008 reste prouvé par sa suite : seulement le code passager autorisé, au plus deux appels,
   média relu et conditions revérifiées, aucun état perdu entre les deux, compteurs distincts et
   aucune reprise automatique d'un passage restauré. Une file arrivée entre-temps interdit l'essai.
5. Début de fin, fermeture et écriture média retenue gardent leurs garanties : les stockages déjà
   commencés atterrissent, aucune nouvelle analyse ne part, une réponse tardive n'enrichit ni ne
   publie après fermeture. Sauvegarde et drainage ne dépendent pas du succès d'un abonné.
6. La garde refuse un accès externe direct à `lanes.cjs` et un import de domaine étranger ; les
   arêtes de transition sont nommées et vérifiées. Le nouveau fichier n'a aucune suppression ESLint.
7. À l'implémentation, jouer les suites citées, capture-intake et les contrats T206/T221/T207 affectés
   en séquentiel, puis `node scripts/check.mjs`. Aucun cas ni assertion métier n'est retiré.

## Test d'acceptation attendu

Les tests `tests/split-perception.test.cjs`, `tests/session-latency.test.cjs` et
`tests/architecture-f08.test.cjs` continuent de passer par `ingest` et les commandes publiques,
avec promesses différées par voie et horloge injectée. Remplacer leurs lectures de files privées
par les comptes/états publiés équivalents sans perdre la preuve des bornes. Un test direct de
`lanes` complète seulement les transitions que l'ingestion ne permet pas d'isoler.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les lignes décrivent l'avant-T194. Les noms exacts des aides restantes et des interfaces T206/T221 seront
relevés au démarrage. Si un helper encore plat doit être lu temporairement, l'exception de garde
doit nommer cette arête et sa fin ; elle ne justifie aucun import de Questions dans la Mémoire.

## Journal
