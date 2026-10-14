---
id: T015
titre: Make the Mac window source-text assertions independent of code layout
statut: a-faire
bloque_par: T152
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Cinq tests comparent caractère par caractère des fragments de `app/renderer.js`, `app/main.cjs`,
`app/ui/job-card.js` et `app/index.html` : apostrophes, espaces, instructions collées sur une ligne, ordre
des attributs. Un formateur les fait échouer sans qu'aucun comportement ait changé. Après ce ticket, ces
cinq tests rendent le même verdict quelle que soit la mise en page du code lu, et chacun échoue encore
quand l'exigence qu'il garde est rompue. Aucun code de production n'est modifié, aucune exigence n'est
perdue. C'est le prérequis du formatage automatique.

## Sources

- Constats : UI-01, OUBLI-24
- Mesure de l'audit, non rejouable hors ligne (Prettier n'est pas installé : `ls node_modules/.bin/prettier`
  échoue) : un formatage à blanc casse 5 tests, 4 dans `tests/mac-ui.test.cjs` et 1 dans
  `tests/mac-ipc-contract.test.cjs`.
- Tests concernés, à la version `0d5a954` :
  - `tests/mac-ui.test.cjs`, test « freshness of a question is shown from what the core measured, and
    nothing is invented without it » (l.105) : trois assertions sur le texte de `app/ui/job-card.js`
    (l.137-140), dont un ordre entre deux fragments.
  - `tests/mac-ui.test.cjs`, test « a saved history still being read is told as a restoration, and a
    history kept in memory only gets a discreet notice: both in the words of the state » (l.275) :
    balisage de la bannière `#watch-notice` de `app/index.html` épinglé avec l'ordre de ses attributs
    (l.331-334), puis quatre fragments de `app/renderer.js` (l.335-339).
  - `tests/mac-ui.test.cjs`, test « search cards name the session they were searched in: a late answer is
    not drawn in another session, and an old card replays nothing there » (l.615) : corps exact de
    `clearSearch`, tranche du gestionnaire `moment-search-form`, ordre de fragments écrits sans espaces
    (l.645-656).
  - `tests/mac-ui.test.cjs`, test « the renderer talks to the bridge of the contract only, and writes no
    ceiling or retention of its own » (l.685) : méthodes du pont relevées par
    `/\b(?:bridge|window\.tvlens)\??\.([A-Za-z]+)/g` (l.688), fragments de `renderer.js` (l.705-706,
    710), trois appels `agreeText(…join(' '))` (l.716).
  - `tests/mac-ipc-contract.test.cjs`, test « every bridge call has its handler, every event its
    listener, and the host no longer purges, preempts or knows Auto » (l.86) : canaux relevés par
    `handle\(\s*'…'` et `send\(\s*'…'` (l.94), puis fragments de `app/main.cjs` (l.103-117), dont une
    tranche bornée par `'surveillanceTimer = setInterval'` (l.111).
- Code épinglé par ces assertions : `app/renderer.js`, fonctions `replay` (l.164-177), `receiveState`
  (l.186-197), `clearSession` (l.540-548), `momentCard` (l.557-562), `clearSearch` et le gestionnaire
  `$('moment-search-form').onsubmit` (l.574-575, le gestionnaire tient sur une ligne de
  615 caractères), `surveillanceView` (l.598-599), `receiveSurveillance` (l.600-610), le début de
  `drawSurveillance` (à partir de la l.611) ; `app/ui/job-card.js`
  l.40 et l.153-156 ; `app/main.cjs`, aides `handle` et `send` (l.84-88), composition de la surveillance
  (l.181-190), canaux `surveillance:stop` (l.200) et `verify:cancel` (l.244), configurations de repli
  (l.55) ; `app/index.html`, bannière (l.46).
- Mécanisme : un formateur passe aux guillemets doubles, met une instruction par ligne, entoure de
  parenthèses le paramètre unique d'une fonction fléchée, ajoute virgules finales et points-virgules,
  coupe les lignes longues. `handle('x'` devient `handle("x"` : le relevé des canaux tombe de 49 à 0 et
  l'égalité avec les canaux du preload échoue. `if(!savedId)return replay(moment.id,0,moment);` devient
  `if (!savedId) return replay(moment.id, 0, moment);` : le motif exact ne correspond plus.
- `docs/standards.md` : « Aucun test ne compare le texte du code source (les gardes d'architecture mises
  à part) ». Les ADR 0001 et 0009 reconnaissent ce couplage. Les tickets suivants du lot remplacent ces
  preuves par des tests de comportement ; celui-ci ne fait que les rendre insensibles à la mise en page.

## Périmètre

- À créer : `tests/helpers/source-shape.cjs`, qui exporte `shape(text)`, et `tests/source-shape.test.cjs`.
  Ce n'est aucun des quatre helpers réservés au lot L05 (`wait`, `clock`, `fake-dom`, `mac-host`).
- À modifier : `tests/mac-ui.test.cjs` (les quatre tests cités), `tests/mac-ipc-contract.test.cjs` (le
  test cité).
- `shape(text)` rend une forme du texte indifférente à ce qu'un formateur change, au minimum : espaces et
  retours à la ligne ; apostrophes et guillemets (un seul signe, échappement d'un guillemet retiré) ;
  virgule placée juste avant `)`, `]` ou `}` ; parenthèses autour du paramètre unique d'une fonction
  fléchée ; points-virgules. Elle ne retire ni ne réordonne aucun identifiant, opérateur ou littéral, et
  ne colle jamais deux mots : entre deux caractères de mot, une suite d'espaces ou de retours à la
  ligne devient un seul espace (`return bridge` ne devient pas `returnbridge`, et un motif qui s'appuie
  sur `\b` garde son sens).
  Aucune dépendance n'est installée : c'est une comparaison de formes, pas un analyseur.
- Chaque assertion qui compare le texte d'un fichier de `app/` à un fragment passe par `shape` des deux
  côtés (fragment exact, motif écrit contre la forme, tranche bornée par des marqueurs mis en forme).
  L'exigence reste la même : même fragment, même ordre, même nombre d'occurrences. Les comptages exacts
  (l.106 et l.108 du test du contrat, l.706 du test de la fenêtre) gardent leur valeur ; une assertion
  d'absence compare elle aussi des formes, pour ne pas devenir vraie par simple changement d'écriture.
- Les remises en page et les fautes injectées pour les preuves sont défaites avant la fin de la session
  (`git checkout -- <chemin>`) : aucun fichier de `app/` ne reste modifié par ce ticket.
- Bannière de `app/index.html` : la balise ouvrante de `#watch-notice` est lue attribut par attribut
  (`id`, `class="banner"`, `role="status"`, `hidden`, rien d'autre), sans dépendre de leur ordre ni des
  retours à la ligne ; elle contient toujours `<span id="watch-notice-text"></span>`, aucun bouton ni
  lien, et précède `<main>`.
- À ne pas toucher : le code de production ; le test « the renderer parses, imports only what its
  modules export, and finds every element it asks for » (ticket suivant) ; les autres tests. Aucun cas de
  test n'est retiré ni renommé, aucune assertion n'est supprimée.
- Les deux nouveaux fichiers n'ont aucune ligne de plus de 160 caractères ; les deux fichiers modifiés
  n'en gagnent aucune (ils en ont 134 et 83).

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/source-shape.test.cjs` passe. Il prouve, sur des paires écrites en dur dans le
   test : (a) forme égale entre la mise en page actuelle et une mise en page de formateur, pour au moins
   `clearSearch`, le gestionnaire `moment-search-form` entier, la ligne de `receiveSurveillance` qui
   reprend la référence de lecture, l'aide `handle` de `app/main.cjs` et un appel `handle('…', () => …)` ;
   (b) forme différente quand un identifiant change, quand deux instructions sont inversées, quand un
   appel disparaît ; (c) deux mots séparés par un retour à la ligne restent deux mots, et `300000` ne
   prend pas la forme de `1300000`.
2. `grep -c "^test(" tests/mac-ui.test.cjs` et `grep -c "^test(" tests/mac-ipc-contract.test.cjs` ne
   rendent pas moins qu'au début de la session (15 et 12 à `0d5a954`) ; les titres des cinq tests sont
   inchangés.
3. Preuve par reformatage, consignée au journal : la session remet en page à la main, dans le style
   décrit au « Mécanisme », les passages listés en « Code épinglé » (pour `app/main.cjs` : tous les
   appels `handle(` et `send(` en guillemets doubles ; pour `app/index.html` : la bannière sur plusieurs
   lignes, attributs dans un autre ordre), puis lance
   `node --test --test-concurrency=1 tests/mac-ui.test.cjs tests/mac-ipc-contract.test.cjs` : tous les
   tests des deux fichiers passent. La même commande, lancée sur ce code remis en page avant de
   convertir les tests, échoue sur les cinq tests cités (sortie consignée) ; la remise en page est
   gardée hors Git, dans le dossier d'état du ticket, pour être rejouée après conversion.
4. Sensibilité conservée, consignée au journal : une faute par test fait échouer le test converti, et lui
   seul parmi les cinq — retirer `clearSearch();` de `clearSession` ; retirer `if (!restoring)` dans
   `receiveSurveillance` ; ajouter un second `cardQueue.offer(` ; déplacer la ligne « Détails du
   traitement » de `job-card.js` après le détail de fraîcheur ; renommer le canal `surveillance:stop`
   dans `app/main.cjs`.
5. Absences encore vues, consignées au journal : écrire `retentionMs: 300000` dans `app/main.cjs`, puis
   la même propriété coupée sur deux lignes, fait échouer le test du contrat les deux fois ; nommer
   `verifierAdapter` dans la composition de la surveillance (l.181-190) le fait échouer aussi.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/source-shape.test.cjs` (nouveau) pour l'aide, et les cinq tests existants, convertis. Frontière :
le texte des fichiers de `app/` tel qu'il est sur le disque, lu comme aujourd'hui ; seule la comparaison
change.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une assertion ne peut être rendue insensible à la mise en page sans
modifier le code de production ou sans perdre une exigence, ou si une faute des critères 4 et 5 ne fait
plus échouer son test : verdict BLOQUÉ, avec l'écart constaté. La remise en page est faite à la main :
ce ticket ne prouve pas le verdict d'un formateur réel, qui n'est pas installé.

## Journal
