---
id: T217
titre: Name the memory lifecycle state transitions in an internal value object
statut: a-faire
bloque_par: T214
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les transitions de cycle de la Mémoire passent par un objet valeur interne. Les hôtes continuent
d'appeler les commandes publiques ; ils ne connaissent ni sa représentation ni ses mutations.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire et Bibliothèque), 6 et 10 ; ADR 0029/0030.
  Ce ticket ne migre pas les deux hôtes vers le coordinateur unique de la phase Bibliothèque.
- Code vérifié à `dd5efc9` : `core/session.cjs:55` initialise `closed`, `core/session.cjs:58`
  `ending`, `core/session.cjs:66` `accepting` et `core/session.cjs:67` `readOnly`.
  `core/session.cjs:85` lève la fin sans fermer l'admission ; `core/session.cjs:90` ferme
  silencieusement l'admission. Ces opérations sont distinctes, pas un seul état « arrêté ».
- `core/session.cjs:126` suspend après disque plein ; `core/session.cjs:379` ferme ;
  `core/session.cjs:427` reprend ; `core/session.cjs:435` met en pause ;
  `core/session.cjs:487` restaure une archive arrêtée et en lecture seule.
- `runtime/session-lifecycle.cjs:68` ferme l'admission avant d'attendre les stockages ;
  `runtime/session-closing.cjs:73` lève la fin avant les attentes de l'hôte.
  `tests/architecture.test.cjs:173` interdit déjà aux compositions d'affecter ces drapeaux.
- Tests lus : `tests/watch-session-ending.test.cjs`, `tests/session-lifecycle.test.cjs`,
  `tests/session-optimization.test.cjs`, `tests/session-latency.test.cjs` et
  `tests/architecture-f08.test.cjs`. ADR 0002/0003/0006/0023 : fin confirmée, publication et ingestion.
- État attendu : T214 possède les voies ; T190 a remplacé le mutateur de question ; T030/T202/T205,
  transitifs, protègent écritures, pureté et sous-zones. Relire leurs gardes avant modification.

## Périmètre

- Ajouter un objet valeur interne dans `core/memory/lifecycle-state.cjs`, avec transitions nommées
  pour pause, reprise, suspension d'admission, début de fin, fermeture d'admission, fermeture et
  restauration. La racine remplace sa valeur par le résultat ; le module n'effectue aucun effet.
- Établir d'abord la table des transitions et des combinaisons actuellement observables. Les axes
  sont partiellement indépendants : `beginEnding` conserve l'admission ouverte ; une pause n'est
  pas une fermeture ; la lecture seule n'est levée que par reprise explicite. Une énumération
  trop courte ne doit pas fusionner ces combinaisons ni introduire de nouveau refus.
- Garder les lectures publiques compatibles nécessaires aux compositions, et les champs publiés
  ou persistés par leur projection/convertisseur. Retirer les affectations dispersées dans la
  racine ; aucun setter public ne laisse l'hôte choisir une combinaison de drapeaux.
- Les commandes conservent leurs effets et leur ordre : publications isolées, sauvegardes
  explicites, signal d'annulation, drainage et retenue restent chez leurs propriétaires actuels.
  La transition de valeur ne remplace ni `landed`, ni la barrière, ni le scellement.
- `tests/architecture-f08.test.cjs:105` et `:147` affectent directement les drapeaux, sans mode
  strict : migrer ces fixtures vers `beginEnding()` et la restauration, sans affectation ignorée.
- Adapter les fixtures qui fabriquent un état par affectation aux commandes ou à la restauration,
  en gardant leurs garanties de refus et de non-publication. Maintenir les permissions T205 et la
  garde des écritures ; ne pas lui ajouter une exemption d'hôte. Ajouter un ADR court sur les axes
  et la propriété des transitions. Élaguer toute suppression ESLint devenue inutile.

## Critères d'acceptation

1. Une table testée couvre les transitions répétées depuis les combinaisons live, en pause,
   admission fermée, en fin, archive en lecture seule et fermée. Les résultats conservent les
   valeurs observables et les refus actuels ; une lecture ne permet pas de muter la valeur interne.
2. `beginEnding` et `closeIntake` restent synchrones, silencieux et idempotents. Le premier laisse
   atterrir un bloc déjà admis sans analyse ; le second refuse les nouvelles admissions. Aucun
   changement d'état seul ne publie ni ne sauvegarde contrairement à leurs contrats actuels.
   `closeIntake` lève la retenue comme aujourd'hui (`core/session.cjs:91`).
3. Pause et reprise publient avant le disque et se règlent après lui. Une reprise refusée par la
   garde disque laisse horloge, lecture seule et captures inchangées. Une archive seulement lue
   ne démarre aucun traitement et n'est pas réécrite.
4. Disque plein ferme l'admission sans effacer ; fermeture annule et empêche les enrichissements
   tardifs. Un passage dont le stockage a déjà commencé reste attendu et sauvegardé ; les essais
   vision interdits en fin, lecture seule ou fermeture le restent.
5. La garde existante reste verte sur le produit et rouge sur une écriture de drapeau par un hôte.
   Les recherches et la relecture ne trouvent plus d'affectation dispersée de ces quatre drapeaux
   dans la racine ; aucune nouvelle commande générique de mutation n'est donnée aux compositions.
6. À l'implémentation, jouer les tests de valeur, les suites citées et les bancs de disque plein
   et d'ingestion affectés en séquentiel, puis `node scripts/check.mjs`. Aucun cas n'est supprimé.

## Test d'acceptation attendu

Créer `tests/memory-lifecycle-state.test.cjs` pour la table de transitions ; les tests publics
`tests/watch-session-ending.test.cjs` et `tests/session-lifecycle.test.cjs` prouvent ensuite ordre,
silence, attente du stockage et refus disque avec des promesses retenues. Les tests de la valeur
seule ne remplacent pas ces preuves de composition.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le nom de l'objet et la représentation composée sont internes ; ce ticket n'invente pas de nouvelle
transition produit. Si une simplification impose de rendre illégale une combinaison actuellement
exposée, consigner cette hypothèse et demander une décision au lieu de changer la règle en refactorant.

## Journal
