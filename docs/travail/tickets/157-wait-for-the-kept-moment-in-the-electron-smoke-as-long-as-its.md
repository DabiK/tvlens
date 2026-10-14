---
id: T157
titre: Wait for the kept moment in the Electron smoke as long as its transcriptions can take
statut: termine
bloque_par: T156
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Le smoke de la fenêtre Mac, `scripts/smoke-electron.mjs`, clique « Garder ce moment », puis attend la tuile du
moment gardé avec le délai par défaut de Playwright, 30 s. Pendant ce temps, l'hôte transcrit avec le vrai
`whisper-cli`, l'un après l'autre, chaque passage récent qui n'a pas encore de transcription. Il prévoit
jusqu'à 15 s par passage, et une fenêtre de 30 s contient une dizaine de passages dans le smoke. Quand le Mac
est chargé, la tuile arrive après 30 s : le smoke échoue alors que le produit fait ce qu'il doit. Depuis que
le contrôle complet lance les smokes, cet échec fait refuser le ticket en cours, quel qu'il soit, et la
boucle le relance sur un modèle plus cher. Après ce ticket, le smoke attend la tuile aussi longtemps que la
conservation peut durer, avec une borne nommée et déduite de ce qu'elle transcrit. En cas d'échec, il dit ce
qu'il attendait et combien de temps. Ce qu'il vérifie ne change pas.

## Sources

- Décision du propriétaire, le 14/10 : rendre ce smoke fiable avant de laisser la boucle traiter les
  tickets suivants avec les smokes dans le contrôle complet.
- Échec observé le 14/10 pendant T152, dans `node scripts/check.mjs`, smokes compris. 37 s après son
  lancement, le smoke s'arrête sur l'attente de la tuile. Les cinq autres smokes passent. La sortie :

  ```
  ✖ smoke-electron.mjs (37 s) : échec (code 1)
      page.waitForSelector: Timeout 30000ms exceeded.
      Call log:
        - waiting for locator('#saved-rail .saved-tile') to be visible
          at scripts/smoke-electron.mjs:93:14
  ```

  La session de T152 ne l'a pas reproduit en trois essais : sans charge, sous charge et après les tests.
  Elle n'avait pas le droit de toucher au smoke. Son relecteur a noté la cause probable, la suite de
  transcriptions.
- Code concerné, à la version `7939d41` :
  - `scripts/smoke-electron.mjs` :
    - l. 89-93 : `#keep-moment`, `#nav-memory`, puis `page.waitForSelector('#saved-rail .saved-tile')`
      sans délai explicite ;
    - `stateTimeoutMs` (l. 13), une attente nommée du même fichier, qui sert de modèle ;
    - l. 11-12 : le lancement d'Electron, qui hérite de l'environnement du smoke ;
  - `core/saved-moments.cjs:9` : `keep` transcrit en série chaque passage disponible des 30 dernières
    secondes sans transcription, avec `AbortSignal.timeout(15000)` par passage ;
  - `app/main.cjs:95` (`keepMoment`) et `app/main.cjs:307` (`saved.transcriber = runtime.transcriber`) ;
  - `adapters/config.cjs:18` : `TVLENS_WHISPER_BINARY` remplace le binaire `whisper-cli`. C'est la couture
    de la reproduction.

## Reproduction

Un faux `whisper-cli` qui attend avant d'appeler le vrai rend la suite de transcriptions plus longue que
30 s, sans charger le Mac. À créer dans `.harness-state/tickets/T157/slow-whisper.sh`, hors Git :

```sh
#!/bin/sh
sleep "${SLOW_WHISPER_S:-3}"
exec /opt/homebrew/bin/whisper-cli "$@"
```

Si `whisper-cli` n'est pas dans `/opt/homebrew/bin`, prendre le chemin de `command -v whisper-cli`. Depuis la
racine du dépôt :

```
TVLENS_WHISPER_BINARY=.harness-state/tickets/T157/slow-whisper.sh node scripts/smoke-electron.mjs
```

## Périmètre

- À modifier :
  - `scripts/smoke-electron.mjs`, à l'étape du moment gardé seulement. L'attente de la tuile reçoit une
    borne nommée, déduite du nombre de passages que la conservation transcrit et du plafond de 15 s par
    passage. Le smoke peut lire ce nombre dans ce qu'il observe déjà, la frise ou l'état de la session. Si
    la tuile n'arrive pas dans la borne, l'échec dit « moment gardé » et donne la borne.
- À ne pas toucher :
  - `core/saved-moments.cjs`, `app/` et le reste du code de production. Une suite de transcriptions qui
    fait attendre l'utilisateur plusieurs dizaines de secondes est un sujet de latence, hors de ce ticket :
    le journal le note ;
  - les autres étapes et assertions du smoke ;
  - les autres smokes, `scripts/check.mjs` et le plancher du cliquet.

## Critères d'acceptation

1. Avant toute modification, la commande de reproduction échoue à l'attente de la tuile, avec
   `SLOW_WHISPER_S=3`. Le smoke passe sans faux binaire. Les deux sorties vont au journal, avec le nombre de
   passages transcrits si le smoke le montre.
2. Après la modification, la commande de reproduction passe avec `SLOW_WHISPER_S=3`, puis avec
   `SLOW_WHISPER_S=8`. Sorties au journal, avec la durée de l'étape.
3. Mutation temporaire : dans `scripts/smoke-electron.mjs`, le clic sur `#keep-moment` est retiré. Le smoke
   échoue dans la borne, avec un message qui nomme l'étape et la borne. La sortie rouge va au journal, puis
   la mutation est retirée.
4. `node scripts/smoke-electron.mjs` passe trois fois de suite sans faux binaire, sans relance sélective.
   Durées au journal.
5. `git diff --stat` ne cite que `scripts/smoke-electron.mjs` et le ticket.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le smoke lui-même, frontière : la vraie fenêtre Electron en mode smoke, comme aujourd'hui. La reproduction
prouve qu'il tient quand la transcription est lente, et la mutation du critère 3 qu'il échoue toujours,
dans un temps borné, quand aucun moment n'est gardé.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Une attente du fait, bornée par ce que fait le produit.** Le plafond de 15 s par passage est celui de
  `core/saved-moments.cjs`. Une borne fixe plus grande, sans lien avec lui, échouerait de nouveau le jour où
  la fenêtre contiendra plus de passages.
- **Le vrai `whisper-cli` reste dans le smoke.** Le remplacer par un faux en mode smoke relève des faux
  fournisseurs (T146), et ferait perdre au smoke ce qu'il vérifie de la transcription locale.
- **Un seul site.** Si un autre site du smoke échoue sous la commande de reproduction, il est corrigé de la
  même façon, et le journal le dit.
- **Pas d'ADR.** Le smoke change sa façon d'attendre, pas ce qu'il prouve.

## Journal

- **Exploration** (`.harness-state/tickets/T157/exploration.md`, `ecarts.md`).
  - En mode smoke, `app/main.cjs:55` ne charge pas la configuration : `TVLENS_WHISPER_BINARY` n'est jamais lue.
    Couture utilisée à la place : un `whisper-cli` factice en tête de `PATH` (même faux, même vrai whisper derrière).
  - Au clic sur « Garder ce moment », l'état contient 2 passages et la conservation n'en transcrit qu'un
    (le faux n'est appelé qu'une fois dans tout le smoke). Le ticket parle d'une dizaine : ce n'est pas le cas
    au moment naturel du clic. Le plafond du produit est de 15 s par passage, un seul passage ne dépasse donc
    pas 30 s avec `SLOW_WHISPER_S=3`.
  - Avant toute modification : `node scripts/smoke-electron.mjs` sans faux : PASS, 68,9 s au total ;
    avec le faux en tête de `PATH` et `SLOW_WHISPER_S=3` : PASS, 72,7 s (3 s de transcription).
    Le critère 1 « échoue » n'est pas obtenu sur le smoke tel quel : écart déclaré, preuve de remplacement
    par un clic tardif temporaire.
- **Implémentation** (`scripts/smoke-electron.mjs`, étape du moment gardé seulement, +18/-1). Le smoke lit dans
  l'état, juste avant le clic, le nombre de passages que la conservation transcrira (même filtre que
  `core/saved-moments.cjs`), et attend la tuile au plus `(passages + 2) x 15 000 ms`. Fenêtre de 30 s et plafond
  de 15 s sont des constantes nommées du smoke, dupliquées du cœur qui ne les exporte pas (le cœur n'est pas touché).
  Échec : « The kept moment (moment gardé) did not appear within N ms: n passages to transcribe, 15000 ms each at most ».
- **Critères 1 et 2, preuve par clic tardif temporaire** (`clic-tardif.patch`, attend 12 passages à transcrire
  avant le clic, non livré, retiré). Couture : faux `whisper-cli` en tête de `PATH`.
  - Smoke d'origine + patch, `SLOW_WHISPER_S=3` : rouge en 55 s, `Timeout 30000ms exceeded` à l'attente de la
    tuile, 10 appels du faux commencés.
  - Smoke modifié + patch, `SLOW_WHISPER_S=3` : vert, 126 s au total, clic -> tuile 38,6 s (12 appels).
  - Smoke modifié + patch, `SLOW_WHISPER_S=8` : vert, 187 s au total, clic -> tuile 98,9 s (12 appels ; borne 210 s).
  - Première version du patch (`waitForFunction` asynchrone) sans effet : le clic partait tout de suite ; remplacée
    par une boucle explicite, le nombre 12 inchangé.
- **Critère 3, mutation** (clic `#keep-moment` retiré, sans faux) : rouge en 50 s, « The kept moment (moment gardé) did
  not appear within 45000 ms: 1 passages to transcribe, 15000 ms each at most », cause `Timeout 45000ms exceeded`.
  Mutation retirée, clic restauré (fichier identique à la version livrée).
- **Critère 4** : `node scripts/smoke-electron.mjs` sans faux binaire, trois fois de suite, sans relance : vert à
  chaque fois, 70 s, 69 s, 69 s.
- **Latence, hors de ce ticket** : avec 12 passages à transcrire, l'utilisateur attend 38,6 s à `SLOW_WHISPER_S=3` et
  98,9 s à 8 avant de voir la tuile. Le produit n'est pas touché ; c'est un sujet de latence à part.
- **Non établi** : la cause de l'échec du 14/10. Au clic naturel, le smoke n'a qu'un passage à transcrire (borne 45 s) ;
  seul un clic tardif simulé reproduit un dépassement de 30 s. Si un passage atteint son plafond de 15 s, la
  conservation jette aussitôt et le smoke attend la borne entière avant d'échouer.
- **Relecture** (`revue-1`, relecteur neuf) : accepté, 0 bloquant, 0 mineur, 2 hors périmètre ; les deux écarts
  déclarés (point d'injection du faux par `PATH`, preuve par clic tardif temporaire) sont acceptés.
- **Contrôle complet** : `node scripts/check.mjs` vert en 129 s (règles, cliquet, 720 tests JS, 84 tests Python ;
  format et lint non lancés, outils non installés). Aucun smoke n'est lancé par ce contrôle dans cet arbre : le
  texte du ticket suppose le contraire ; le smoke a été lancé à part (critères 2, 3 et 4).

### Réserves à la clôture

- Écart accepté, critères 1 et 2 : en mode smoke app/main.cjs ne charge pas la configuration, TVLENS_WHISPER_BINARY n'est jamais lue ; le faux whisper-cli est mis en tête de PATH à la place (même faux, même vrai whisper derrière). La commande de reproduction écrite dans le ticket est à corriger.
- Écart accepté, critère 1 : au clic naturel le smoke n'a qu'un passage à transcrire (le faux n'est appelé qu'une fois), et le smoke d'origine passe avec SLOW_WHISPER_S=3. L'échec avant modification n'est obtenu qu'avec un clic tardif temporaire (12 passages), non livré (clic-tardif.patch dans .harness-state/tickets/T157/).
- Non établi : la cause de l'échec du 14/10. Avec un seul passage, une transcription qui atteint son plafond de 15 s fait jeter la conservation aussitôt ; le smoke attendrait alors la borne entière puis accuserait l'attente. Suite possible : faire remonter au smoke l'erreur de saved:keep.
- Hors périmètre : la fenêtre de 30 s et le plafond de 15 s sont dupliqués dans le smoke (constantes nommées) parce que core/saved-moments.cjs les écrit en dur sans les exporter ; à nommer et exporter dans un ticket qui ouvre le cœur.
- Hors périmètre, latence : avec 12 passages à transcrire l'utilisateur attend 38,6 s (SLOW_WHISPER_S=3) à 98,9 s (8) avant la tuile.
- Le contrôle complet ne lance aucun smoke dans cet arbre, contrairement à ce que dit le ticket : la fiabilité du smoke dans le contrôle n'a pas été éprouvée par lui.
