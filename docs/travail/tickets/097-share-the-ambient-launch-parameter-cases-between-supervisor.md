---
id: T097
titre: Share the ambient launch parameter cases between supervisor and page tests
statut: termine
bloque_par: T096, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le superviseur Python lance la page d'incrustation avec des paramètres que la page JavaScript valide. Les
deux côtés sont testés séparément : la suite JavaScript part d'un objet de lancement écrit à la main, la
suite Python vérifie le moment du lancement mais pas la forme exacte de ce qu'il envoie. Un changement d'un
côté (un champ renommé, un cadre déplacé, un texte réduit autrement) passe les deux suites et casse l'écran.

Après ce ticket, un fichier de cas partagé décrit, pour chaque situation, la carte publiée par le serveur, les
paramètres que le superviseur doit envoyer et ce que la page doit en retenir. La suite Python exige que le
superviseur produise exactement ces paramètres ; la suite JavaScript exige que `parseAmbientParams` les
accepte et en retienne exactement la vue attendue.

## Sources

- Constats : TSTC-14
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `tv/ambient.py`, lancement de la page dans le superviseur (lignes 835-843) : `params = {'v': 1, 'nonce',
    'control', 'element', 'profile', 'box', 'displayMs'}` (ligne 837), `activity` ajouté quand il a un
    libellé (ligne 839), `card` = `reduce_card(...)` (ligne 840), `probe` (ligne 841), puis
    `self.luna.spawn('com.webos.applicationManager/launch', {'id', 'params'})` (ligne 843). Cadres :
    `BOXES` (ligne 32), cadre `raised` ou `low` selon le réglage `position` (ligne 163, défaut ligne 60).
    `reduce_card(card, more)` (ligne 232) : texte coupé au-delà de 600 caractères, trois hôtes au plus,
    jamais d'URL.
  - `tests/test_tv_ambient.py` : `card(seq, …)` (ligne 74), classe `Rig` (ligne 78) — jetons déterministes
    (`'%032x' % n`), `control='http://127.0.0.1:8788'`, `launches()` (ligne 116) rend la charge de chaque
    appel `launch` (`id`, `params`), `show(*cards)` mène jusqu'à l'affichage, `fresh(seq)` construit une carte
    à l'heure du serveur.
  - `tv/app/surveillance-overlay.js`, fonction `parseAmbientParams` (ligne 353, exportée dans l'objet des
    lignes 481-492).
  - `tests/tv-ambient-params.test.cjs` : fonction fléchée `launch(extra)` qui rend un objet de lancement
    écrit à la main (lignes 11-18), objet `parsed` écrit à la main (lignes 19-25) ; premier test « valid
    launch parameters are accepted as an object and as the JSON string webOS hands over » (ligne 27).
- Ce ticket suit T096, qui ajoute la classe `SharedConstants` à `tests/test_tv_ambient.py` et un test à la
  suite JavaScript de l'incrustation : les deux tickets touchent les mêmes fichiers de test.

## Périmètre

- À créer : `tests/fixtures/tv-ambient-launch-cases.json` : `version`, une phrase `about` qui dit que les deux
  suites le lisent, et une liste `cases` dont chaque entrée porte `name`, la carte publiée (`card`), le
  contexte utile (profil, activité, réglage d'affichage, nombre de cartes en attente), `launch` (paramètres
  attendus du superviseur, `nonce` compris tel que le banc le produit) et `parsed` (vue attendue de la page).
  Au moins : une carte simple au profil `relay` ; une carte avec le réglage `position` à `low` ; une carte au
  texte de plus de 600 caractères ; une carte à plus de trois sources (la page n'en reçoit que trois, et
  `sourceCount`) ; une carte avec activité en retard ; une carte avec d'autres cartes en attente (`more`). Un cas que le banc `Rig` ne sait pas produire sans
  modifier le code de production est écarté et nommé au journal, avec la raison ; il en reste au moins quatre.
- À modifier : `tests/test_tv_ambient.py` (une classe `LaunchContract` qui joue chaque cas avec `Rig` et
  compare `rig.launches()[-1]['params']` à `launch`) ; `tests/tv-ambient-params.test.cjs` (un test par cas,
  `parseAmbientParams(launch)` égal à `parsed`, et `parseAmbientParams(JSON.stringify(launch))` aussi).
- La fonction `launch(extra)` et l'objet `parsed` écrits à la main dans `tests/tv-ambient-params.test.cjs`
  restent en place : ils servent aux tests de refus qui les modifient. Le test ligne 27 peut les comparer au premier cas du
  fichier, sans perdre d'assertion.
- À ne pas toucher : `tv/ambient.py`, `tv/app/`, les autres classes de `tests/test_tv_ambient.py`.
- Les valeurs attendues du fichier sont écrites à partir de ce que le code produit aujourd'hui, observé une
  fois par la session puis figé en littéraux ; le journal dit comment elles ont été obtenues.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `python3 -B -m unittest discover -s tests -p test_tv_ambient.py` passe, et sa sortie en mode verbeux
   (`-v`) montre `LaunchContract` avec un sous-test par cas du fichier.
2. `node --test tests/tv-ambient-params.test.cjs` passe et contient un `test(` par cas du fichier ; les tests
   qui existaient gardent leur titre et leurs assertions.
3. Les deux suites lisent le même fichier : `grep -n "tv-ambient-launch-cases.json" tests/test_tv_ambient.py
   tests/tv-ambient-params.test.cjs` montre une lecture dans chacune, et aucune des deux ne réécrit les
   valeurs attendues en dur à côté.
4. Preuve que le contrat protège, au journal avec commande et sortie : en remplaçant provisoirement
   `'displayMs': int(...)` par `'display': int(...)` à la ligne 837 de `tv/ambient.py`, la suite Python
   échoue ; en faisant provisoirement refuser à `parseAmbientParams` un `displayMs` de 14000, la suite
   JavaScript échoue. Les deux remplacements sont retirés avant la fin de la session.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/fixtures/tv-ambient-launch-cases.json`, la classe `LaunchContract` de `tests/test_tv_ambient.py` et les
tests ajoutés à `tests/tv-ambient-params.test.cjs`. Frontières : l'appel `applicationManager/launch` que le
superviseur adresse à son faux Luna, et la fonction exportée `parseAmbientParams`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si, pour un cas, la page refuse des paramètres que le superviseur produit
aujourd'hui : le cas est écrit tel qu'observé, le test JavaScript de ce cas exige le refus, son titre dit
qu'il s'agit d'un écart connu, et le journal le signale pour le propriétaire. Aucun code de production n'est
corrigé par ce ticket.

## Journal
- 19/10, propriétaire : retiré sans travail, sur l'avis d'Astra. L'overlay ambient visé a été supprimé (`docs/adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md`) : ce ticket n'a plus d'objet.
