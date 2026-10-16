---
id: T216
titre: Extract memory loss and coverage calculations into a pure module
statut: a-faire
bloque_par: T214
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

`core/memory/coverage.cjs` calcule les projections de pertes et de couverture à partir des passages,
des compteurs acquis et de l'horloge injectée. Les vues, archives et consommateurs gardent les
mêmes chiffres et les mêmes trous.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire), 6, 8 et 9 ; ADR 0029/0030.
  Les pertes explicites et les compteurs du nouvel essai restent ceux des ADR 0008 et 0023.
- Code vérifié à `dd5efc9` : `core/session.cjs:63` initialise les compteurs à l'endroit où les
  pertes surviennent ; `core/session.cjs:292` compte une transcription qui signale son échec,
  même avec `audioStatus: ready`. `core/session.cjs:347` et `core/session.cjs:359` distinguent
  nouvel essai commencé et récupération réussie.
- `core/session.cjs:490` rassemble historique et passages ; `core/session.cjs:492` construit
  les trous totaux ; `core/session.cjs:499` projette les compteurs et la retenue en cours ;
  `core/session.cjs:500` et `core/session.cjs:501` distinguent trous audio et vision.
  `core/session.cjs:465` reprend les compteurs d'archive avec des bornes pour les seconds essais.
- `core/latency-trace.cjs` est une mesure séparée ; le résumé vivant compte ses interruptions
  de capture à `core/living-recap.cjs:67`. Les filtres de trous ci-dessus ne comportent pas de
  seuil numérique et ne calculent pas un pourcentage de durée observée.
- Tests lus : `tests/session-latency.test.cjs`, `tests/split-perception.test.cjs`,
  `tests/architecture-f08.test.cjs` et `tests/watch-session-ending.test.cjs`.
  Lecteurs établis : `runtime/state-views.cjs:34` et `:241-244`, `runtime/session-manifest.cjs:82`,
  `app/session-rows.cjs:12-13`, `runtime/headless-runtime.cjs:480-483`, `app/main.cjs:354` et
  `runtime/headless-session-lifecycle.cjs:145`.
- État attendu : T214 possède les voies et la retenue générique ; T206/T221 ont publié les événements.
  Relire leurs sources et contrats, ainsi que T207/T208 s'ils sont déjà livrés : ne pas reconstituer
  les pertes depuis des événements manqués, ni reprendre l'extraction des voies.

## Périmètre

- Extraire les filtres de trous et la projection des compteurs dans `core/memory/coverage.cjs`.
  Le module est pur : passages, compteurs, durée acquise et temps de retenue courant sont des
  entrées ; aucun accès à la racine, au store, au fournisseur ou à l'horloge globale.
- Garder les compteurs acquis dans leur propriétaire, au lieu de les recompter sur les seuls
  passages encore présents. Préserver l'absence des compteurs optionnels tant qu'ils n'ont
  jamais eu lieu (`visionRetried`, `visionRecovered`, `videoUnreadable`).
- Conserver exactement la séparation : trou total pour un passage `error`, `skipped` ou `expired` ;
  trou audio pour `audioFailed` ou le statut audio perdu d'un passage partiel ; trou vision pour
  la vision perdue d'un passage partiel, avec sa cause éventuelle. Les formes historiques restent
  lisibles après T223 si le retrait de l’élagage a déjà été livré.
- Nommer les ensembles de statuts et tout seuil réellement rencontré dans le code livré. Ne pas
  déplacer les seuils de sujet (1000 ms), d'interruption du résumé (250 ms), d'admission ou de
  latence : ils n'appartiennent pas à ce calcul. Ne pas inventer un taux de couverture métier.
- Brancher les lecteurs déjà livrés (snapshot, vue ou convertisseur d'archive) sur le même résultat
  là où ils l'utilisent, sans faire de T207/T208 un prérequis implicite. Adapter `core/memory/index.cjs`
  seulement si un export public est nécessaire ;
  maintenir la table de zones et les permissions T205 sans ouvrir le module interne aux hôtes.
  Élaguer les suppressions ESLint devenues inutiles ; aucun déplacement d'infraction gelée.

## Critères d'acceptation

1. Sur une mémoire mélangeant historique et passages actifs, trous totaux, audio et vision gardent
   exactement leurs identifiants, intervalles, statuts et causes. Paroles conservées avec vision
   perdue n'est pas un trou total ; `audioFailed` reste visible même si le passage finit `ready`.
2. Après saturation, échec ou nouvel essai, chaque perte est comptée une fois ; plusieurs lectures
   de la vue ne changent aucun compteur. Deux essais puis succès donnent essayé/récupéré sans
   perte vision ; deux échecs donnent essayé/perdu sans récupération.
3. La retenue en cours s'ajoute au total acquis sans double compte. Le relâchement, la fermeture
   et la fin de file arrêtent sa mesure selon la politique livrée par T214.
4. Un aller-retour d'archive préserve les compteurs autorisés, rejette les valeurs impossibles
   comme auparavant et n'invente pas de compteurs optionnels à zéro. Les variantes historiques
   expirées restent consultables, même après retrait de l'élagage actif.
5. Des tests publics de session donnent les mêmes projections qu'avant l'extraction, en plus
   des cas directs du module pur. Aucun consommateur de ce calcul ne duplique ses filtres ou
   son arithmétique. Les calculs d'interruption propres aux outils (`core/video-tools.cjs:106-111`),
   à la surveillance (`core/surveillance.cjs:828`) et à `captureGapsOf`
   (`runtime/state-views.cjs:99-108`) restent hors de ce module.
6. À l'implémentation, exécuter les suites citées, les contrats de vue/archive affectés et la garde
   en séquentiel, puis `node scripts/check.mjs`. Aucun cas ni plancher n'est retiré ou affaibli.

## Test d'acceptation attendu

Créer `tests/memory-coverage.test.cjs` pour comparer les sorties du module pur sur les combinaisons
discriminantes de statuts, sans recopier ses expressions. Conserver les cas d'ingestion et de
restauration dans les suites existantes : ils prouvent que les compteurs restent acquis au bon
endroit et que la vraie vue appelle ce calcul. Horloge et fournisseurs sont maîtrisés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le mot couverture désigne ici le contrat réellement présent : décomptes, pertes par modalité et
retenue, sans nouvelle formule de pourcentage. Un besoin de taux temporel serait une règle métier
à faire décider séparément. Aucun résultat de test n'a été exécuté pendant le découpage.

## Journal
