---
id: T168
titre: Keep Mac capture resources inside one controller
statut: a-faire
bloque_par: T167
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Tous les chemins de capture de la fenêtre Mac utilisent la même instance du contrôleur livré par T167.
Le renderer ne possède plus les handles de capture ni les attentes de flush ; il commande l'aperçu,
l'observation, les checkpoints et la libération par une interface explicite. Un arrêt laisse le
contrôleur sans ressource de capture détenue.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », contraction Mac.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Repères vérifiés à `e92c6a6`, avant l'extraction T167 :
  - `app/renderer.js:24` et `app/renderer.js:34` possèdent les handles et `flushes` ;
    `app/renderer.js:88` déduit les boutons de `recorder` et `stream` ;
  - `app/renderer.js:201` et `app/renderer.js:258` demandent l'arrêt silencieux lorsque l'hôte
    n'accepte plus ; `app/renderer.js:382` ne libère au déchargement que les pistes du stream ;
  - `app/renderer.js:411` arrête avant de changer de source ; `app/renderer.js:414` observe avec
    la source choisie ; `app/renderer.js:438` lance le choix flottant et `app/renderer.js:454`
    branche son bouton d'enregistrement ;
  - `app/renderer.js:493` confirme la reprise d'archive ; `app/renderer.js:500` choisit son chemin
    de capture et `app/renderer.js:520` interdit d'ouvrir une archive pendant l'aperçu ou l'enregistrement ;
  - `app/renderer.js:749` prend une image du moment et appelle le checkpoint ;
    `app/renderer.js:780`, `app/renderer.js:798` et `app/renderer.js:811` font de même pour
    expliquer, rattraper et garder l'attention, avec leurs ancres respectives ;
  - `app/recording.js:43` attend les ingestions au checkpoint ; `app/recording.js:81` arrête le
    recorder. `app/renderer.js:158` remet le recorder à `undefined` sur échec d'observation et
    appelle seulement l'arrêt hôte : le nettoyage complet des handles n'y est pas explicite ;
  - `tests/mac-ui.test.cjs:1025` vérifie encore un emplacement textuel de branchement ;
    `tests/mac-ui.test.cjs:1049` parcourt les modules renderer ;
    `tests/mac-ipc-contract.test.cjs:335` protège pause et reprise d'archive côté hôte.
- ADR 0002, 0004 et 0007 dans `docs/adr/` : conservation de l'intervalle, archivage et ordre de fermeture.
  L'ADR et les tests ajoutés par T167 sont à relire dans leur version livrée avant de commencer.

## Périmètre

- Achever `app/ui/capture-controller.mjs` et son câblage dans `app/renderer.js` : commandes plein
  écran et flottantes, choix de source, reprise confirmée d'archive, arrêts silencieux, checkpoints,
  prélèvement de l'image de moment et déchargement de page.
- Faire disparaître les propriétaires `stream`, `context`, `worklet`, `recorder`, `flushes` et la
  garde d'arrêt du renderer. Ils vivent dans le contrôleur ; la page ne reçoit que les états et
  opérations nécessaires. Les accès provisoires aux handles de T167 sont retirés.
- Centraliser le nettoyage des pistes, contexte, ports/callbacks audio et attentes de flush après
  arrêt ou échec partiel. Le contrôleur ne crée ni recorder ni minuterie après sa libération.
- Compléter `tests/capture-controller.test.cjs` et ajouter au besoin
  `tests/mac-capture-actions.test.cjs` pour le câblage des commandes avec une page minimale.
  Remplacer les assertions de placement touchées par des assertions sur les actions réellement appelées ;
  conserver les autres gardes de T016 et les scénarios de recorder de T021.
- Appliquer la décision de l’ADR créé par T167 : l'état cible est un seul propriétaire des ressources
  de capture et de leur libération, atteint en deux temps avec ce ticket. Citer son numéro livré
  dans le journal ; `adr: non`, aucun nouvel ADR ni révision de cette décision n’est demandé ici.
- Ne pas changer les messages IPC, la confirmation d'écriture d'archive, la politique de conservation,
  les ancres des actions, la numérotation des passages, les règles de silence ou le protocole de fermeture hôte.

## Critères d'acceptation

1. Un test de câblage déclenche l'observation directe, le bouton flottant et la reprise d'archive
   confirmée. Chaque chemin commande la même instance injectée du contrôleur ; une reprise refusée
   par l'utilisateur ne commande aucune capture. Le chemin flottant ne construit pas un second recorder.
2. Les quatre actions qui font un checkpoint passent par le contrôleur, avec l'ancre déjà figée pour
   moment, explication et rattrapage, et sans ancre inventée pour l'attention. Une ingestion différée
   empêche l'action dépendante de partir avant la fin du checkpoint ; le recorder est celui de la
   capture courante. Le prélèvement de miniature reste celui du même aperçu.
3. Les boutons et l'interdiction d'ouvrir une archive se calculent depuis le statut public du
   contrôleur. Le renderer n'arrête plus de piste, ne ferme plus de contexte, n'instancie plus de
   recorder et ne tient plus de table de flush. La commande
   `grep -nE "new RollingRecorder|getTracks\(|flushes|AudioWorkletNode" app/renderer.js`
   rend une sortie vide (code 1, aucune correspondance), consignée au journal. Les tests de câblage
   et les gardes d’imports/bridge complètent cette preuve de contraction.
4. Arrêt normal, arrêt silencieux demandé par l'état, fin de piste et échec partiel de démarrage
   convergent sur le même nettoyage. Les tests constatent un seul arrêt hôte, toutes les pistes
   arrêtées, le contexte fermé, l'aperçu détaché et aucun timer de flush restant. Un acquittement audio
   tardif ne relance rien et ne touche plus la page libérée.
5. Le déchargement de la page commande la libération par le contrôleur. Le test d'une libération
   répétée ne laisse ni callback audio actif ni ressource détenue. La partie asynchrone est testée
   par la promesse de libération ; le ticket ne promet pas qu'un navigateur attend cette promesse
   lorsqu'il ferme la page.
6. Une mutation qui contourne le contrôleur pour le checkpoint flottant ou l'une des actions rend son
   test de câblage rouge ; sortie au journal, puis mutation retirée. Les suites Mac concernées passent
   en séquentiel, puis `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/mac-capture-actions.test.cjs` ou les cas de câblage équivalents de `tests/mac-ui.test.cjs`, frontière :
les actions de page avec un contrôleur injecté enregistrant ses appels. `tests/capture-controller.test.cjs`
vérifie ensuite les effets sur les vraies commandes publiques du contrôleur avec un recorder et des
ressources simulés. Aucun test ne se contente de chercher un appel dans le texte du renderer.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T167 implique les prérequis Mac et T150. Les repères ci-dessus décrivent le code avant T167 ; ses
délégations et ses tests livrés sont le point de départ, sans reconstituer une seconde extraction.
Le code actuel ne garantit pas un nettoyage complet au déchargement ou dans tous les échecs d'observation :
les critères de libération sont à démontrer. Aucune garantie sur l'attente du navigateur à sa fermeture
n'est déduite de ces tests hors ligne.

## Journal
