---
id: T157
titre: Wait for the kept moment in the Electron smoke as long as its transcriptions can take
statut: a-faire
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
