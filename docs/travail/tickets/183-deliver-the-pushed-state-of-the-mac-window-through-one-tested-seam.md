---
id: T183
titre: Deliver the pushed state of the Mac window through one tested seam
statut: a-faire
bloque_par: T168, T058
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La réception et l’application des états poussés de la fenêtre Mac passent par une couture importable
et testée. Elle conserve le regroupement par frame et le secours à 100 ms, permet d’observer la fin
du dessin réel et se libère sans appliquer un état tardif. T178 réutilise cette couture pour sa mesure.

## Sources

- `docs/audit-points-chauds.md`, section B, réception/préparation du rendu Mac, et section C
  « Latence », délai manquant de livraison à la vue.
  Décision du propriétaire, le 15/10 : isoler cette couture du scénario de mesure de T178.
- Repères vérifiés à `e92c6a6`, avant T129 et T167/T168 :
  - `app/renderer.js:40`, `batched`, regroupe les dessins par frame et timer de secours à 100 ms ;
  - `app/renderer.js:201`, `receiveState`, adopte la session et programme `drawState` ;
    `app/renderer.js:214` dessine l’état, `:232` compose son ordonnanceur ;
  - `app/renderer.js:274`, `chatContext`, lit `Date.now()` ; `:278`, `drawChat`, applique
    `jobEntry`/`KeyedList`, puis `:298` compose l’ordonnanceur de chat ;
  - `app/renderer.js:315` et `:317` reçoivent vérifications et questions poussées ; `:318-319`
    lit leurs états initiaux. T129 sécurise ces lectures avant le présent déplacement ;
  - `app/ui/job-card.js:34`, `jobBlocks`, et `app/ui/list-view.mjs:9`, `KeyedList`, fournissent
    les vrais nœuds et leur réconciliation. Ils servent à prouver une application DOM réelle ;
  - `tests/mac-ui.test.cjs:10` importe les modules UI sans Electron ; ses gardes d’imports et
    de bridge commencent à `:1049`. Aucun `app/ui/state-delivery.mjs` n’existe à ce commit.
- T168 achève la possession des ressources de capture ; T058 livre `tests/helpers/clock.cjs`.
  ADR 0003, publication avant disque ; ADR du contrôleur T167 à relire après sa livraison.

## Périmètre

- Créer `app/ui/state-delivery.mjs`, importable sans DOM, bridge ou Electron au chargement :
  réception, regroupement et application reçoivent horloge, demande/annulation de frame,
  minuteries et callbacks de dessin. La fabrique expose réception/programmation et libération.
- Brancher le renderer sur cette couture pour les états de session, questions et vérifications.
  Conserver la séparation actuelle de leurs dessins, le dernier état reçu, l’ordre de mise à jour
  et le secours à 100 ms. Les autres consommateurs de `batched` gardent leur comportement.
- Fournir des observations optionnelles de réception et de retour du dessin avec identité d’émission
  locale, utilisables par T178. Horodatage et callback d’application ont lieu autour du vrai dessin,
  sans nouvel IPC, champ d’instantané, écriture disque ou statistique produit obligatoire.
- Rendre le chemin d’application des cartes réutilisable avec les vrais `jobEntry` et `KeyedList`,
  sans reconstituer le renderer par réécriture de son source ni recopier son dessin dans un test.
  Limiter toute extraction de dessin à ce qui rend la couture et ses cartes observables.
- Ajouter `tests/state-delivery.test.cjs`, avec l’horloge commune de T058, frames contrôlées et
  document minimal pour les vraies cartes. Réutiliser les helpers DOM existants s’ils suffisent,
  sinon compléter leur seule surface nécessaire. Garder les gardes d’imports/IDs/bridge de T016
  et les scénarios de fraîcheur de T129 ; remplacer seulement une garde de placement touchée.
- Ajouter un ADR au premier numéro libre sur la couture, ses dépendances et sa libération.
  Ne pas modifier capture, cartes/modèles, protocole du preload ou règles de fraîcheur T129.
  Aucun scénario de mesure, fournisseur, Electron, installation ou changement de harnais ici.

## Critères d'acceptation

1. Le vrai module s’importe sans navigateur. Plusieurs états de la même source reçus avant une
   frame produisent une seule application du dernier état. Le callback de réception précède celui
   d’application, qui n’est observé qu’au retour du vrai dessin.
2. Sans frame, le timer applique à 100 ms ; si la frame arrive avant, elle annule le secours.
   Une frame tardive après le secours ne redessine pas. Le test conduit les deux ordres et vérifie
   comptes de dessins, nœuds/texte des vraies cartes et aucune minuterie de secours restante.
3. Des états de session, approfondissement et vérification gardent leurs effets sur la même page,
   sans mélange entre sources. Les lectures écartées par T129 n’appliquent rien, et une poussée
   plus récente reste visible après résolution d’une ancienne lecture.
4. Libérer annule timer et frame détenus, puis rend leurs callbacks tardifs sans effet. La
   libération répétée ne réarme rien ; l’horloge expose `armed = 0` à la fin de chaque cas.
5. Un cas de câblage reçoit une question par le faux bridge de la page minimale et observe sa
   carte réelle après la frame. Une mutation qui programme un deuxième dessin après le secours
   rend le test du critère 2 rouge ; sortie au journal puis mutation retirée.
6. Les tests de couture, fraîcheur, cartes et contrôles Mac passent en séquentiel avec leurs
   assertions conservées, puis `node scripts/check.mjs` est vert. Le journal donne l’interface
   réutilisable par T178 et les fichiers de rendu réellement traversés.

## Test d'acceptation attendu

`tests/state-delivery.test.cjs` importe la couture réelle et conduit réception, frame, secours et
libération. L’application utilise les vrais constructeurs de cartes et la vraie réconciliation DOM ;
un callback qui compte seulement sans dessiner ne vaut pas preuve d’application. Un cas de page
minimale vérifie le câblage au bridge sans démarrer Electron.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T168 implique T167, T129, T016, T021 et T150 ; T058 fournit l’horloge sans nouvelle copie locale.
Relire leurs interfaces livrées avant de déplacer réception et dessin. Ce ticket fournit une
couture d’ordonnancement et d’application, sans mesure physique de pixels ou objectif de latence.
Le scénario de mesure et sa corrélation serveur/TV restent dans T178.

## Journal
