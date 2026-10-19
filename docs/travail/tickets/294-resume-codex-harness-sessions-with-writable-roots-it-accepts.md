---
id: T294
titre: Resume Codex harness sessions with writable roots it accepts
statut: a-faire
bloque_par: T293
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Sur un ticket de harnais, une correction par Codex reprend la session de la tentative au lieu d'en ouvrir une neuve :
les dossiers du harnais restent accessibles en écriture par une option que `codex exec resume` accepte.

## Sources

- Décision du propriétaire, le 19/10 : « Oui pour les points 1 et 2 », dont ce ticket, qui modifie le harnais.
- Huit occurrences au 19/10, la dernière sur T292 : événement `reprise-impossible`, « Codex : options requises de
  reprise indisponibles : error: unexpected argument '--add-dir' found ». La boucle ouvre alors une session neuve,
  qui relit tout : 7,3 millions de jetons d'entrée pour la reprise de T251.
- CLI installé : `codex-cli 0.163.0`. `codex exec --help` propose `--add-dir <DIR>` ; `codex exec resume --help` ne le
  propose pas, mais accepte `-c, --config <key=value>`.
- Code à `77cb75b`, `scripts/loop/codex.mjs` :
  - `:56` les dossiers `.codex` et `.agents` passent par `--add-dir` quand `TVLENS_HARNESS=1` ;
  - `:30-39` `checkResumeOptions` sonde `codex exec resume … --help` avec ces options et refuse la reprise si elles
    manquent ;
  - `:76-87` arguments de session ; une reprise fixe déjà le mode par `-c sandbox_mode="workspace-write"`.
- Doublure : `tests/helpers/codex-session.cjs:48` annonce `--add-dir` pour la reprise, contrairement au CLI réel ;
  `tests/ticket-loop.test.cjs:1857`, `:3410-3445` couvrent les options de reprise.
- Hypothèse à vérifier : la clé de configuration `sandbox_workspace_write.writable_roots` donne, en reprise, les
  mêmes dossiers en écriture que `--add-dir` en lancement.

## Périmètre

- À modifier : `scripts/loop/codex.mjs`, `tests/helpers/codex-session.cjs`, `tests/ticket-loop.test.cjs`.
- En reprise d'un ticket de harnais, passer les dossiers du harnais par
  `-c sandbox_workspace_write.writable_roots=[…]` (chemins absolus, échappés en TOML) au lieu de `--add-dir`, et
  sonder cette forme dans `checkResumeOptions`. Le lancement initial garde `--add-dir`, ou passe à la même clé si
  c'est plus simple : une seule façon par type de session, documentée en commentaire.
- La doublure reflète le CLI réel : `exec resume --help` sans `--add-dir`.
- Si la sonde montre que la clé n'est pas acceptée, garder la session neuve actuelle et s'arrêter avec un verdict
  PARTIEL et la preuve.
- À ne pas toucher : le choix des dossiers, les autres options de session, `scripts/check.mjs`.
- Contrôle réel, par l'orchestrateur après intégration : la prochaine reprise d'un ticket de harnais doit reprendre sa
  session, sans événement `reprise-impossible`.

## Critères d'acceptation

1. Reprise d'un ticket de harnais avec la doublure fidèle au CLI réel : la session est reprise, les dossiers du
   harnais figurent dans `writable_roots`, aucun `--add-dir` n'est passé à `exec resume` ; le test échoue avant la
   correction.
2. Ticket hors harnais : arguments de reprise inchangés.
3. `node --test tests/ticket-loop.test.cjs`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs` : une correction de ticket de harnais reprise par la doublure Codex fidèle au CLI réel.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
