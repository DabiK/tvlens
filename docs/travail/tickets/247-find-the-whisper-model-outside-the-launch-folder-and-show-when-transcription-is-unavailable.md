---
id: T247
titre: Find the Whisper model outside the launch folder and show when transcription is unavailable
statut: termine
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le modèle Whisper par défaut est trouvé quel que soit le dossier depuis lequel l'app ou le serveur est lancé. Quand la
transcription locale est indisponible (modèle ou binaire absent), le Mac et la TV le disent de façon visible, au lieu de
montrer des passages sans paroles comme si la vidéo était muette.

## Sources

- Constat du 17/10 : l'app Mac lancée depuis un worktree du dépôt, sans dossier `.local/models`, a transcrit 0 passage
  sur 6 alors que le son des passages était bon (WAV de 8 s à −21 dB en moyenne). Le chat a répondu que « les
  transcriptions reçues sont vides ». Une fois le modèle rendu accessible, 7 passages sur 7 ont été transcrits.
- Code vérifié à `5e3f479` :
  - `runtime/session-providers.cjs:61-68` : sans `TVLENS_WHISPER_MODEL`, le modèle par défaut est cherché à partir de
    `process.cwd()` (`.local/models/ggml-base.bin`), donc du dossier de lancement ;
  - `scripts/setup-speech.mjs:4` installe le modèle au même endroit, relatif au dossier courant ;
  - `adapters/local-transcriber.cjs:77` vérifie le modèle ; en cas d'échec, `:107-109` rend un texte vide, la limite
    « Transcription locale indisponible : vérifie Whisper et son modèle. » et `metrics.failed: true`. Cette limite ne
    devient aucun avertissement visible côté Mac ni côté TV.

## Périmètre

- Résoudre le modèle par défaut à partir de la racine de l'application (le dépôt pour le serveur et l'app de
  développement), pas du dossier courant. `TVLENS_WHISPER_MODEL` reste prioritaire. Le chemin de l'app empaquetée n'est
  pas changé ici : le dire dans le journal s'il dépend aussi du dossier courant.
- Au démarrage de l'hôte, vérifier une fois la présence du binaire et du modèle, et exposer l'état « transcription
  indisponible » avec sa cause (modèle introuvable, binaire introuvable), sans chemin privé dans les vues TV.
- Un passage dont la transcription a échoué porte une perte audio avec une cause codée, pas une transcription vide
  présentée comme un silence. La fenêtre Mac et la page TV affichent un avertissement durable, une seule fois, tant que
  la cause dure.
- À ne pas toucher : le choix du modèle, la langue, les réglages de Whisper, la capture.

## Critères d'acceptation

1. Un test lance la composition depuis un dossier courant différent de la racine du dépôt et prouve que le modèle par
   défaut est trouvé ; `TVLENS_WHISPER_MODEL` reste prioritaire.
2. Un test avec un modèle absent prouve que l'état « transcription indisponible » est exposé avec sa cause, que le
   passage porte une perte audio codée, et que la vue Mac et la vue TV l'affichent par code.
3. Un test avec un vrai silence (transcription réussie mais vide) prouve qu'aucun avertissement n'apparaît.
4. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Tests de composition et du transcripteur avec un binaire et un modèle simulés, et tests des vues Mac et TV pour
l'avertissement.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Ce ticket modifie `runtime/session-providers.cjs`, que T209 modifie aussi, dans une autre fonction (l'index et le
manifeste). Si T209 est intégré avant, relire le fichier livré. Après l'intégration, l'orchestrateur vérifie en réel
sur le Mac que les passages sont transcrits depuis un worktree, et l'écrit dans le journal.

## Journal

- Exploration : règles et ADR lus, témoin hooks présent ; modèle lié au budget/cwd et échec déjà compté sans cause codée confirmés. Détails dans `.harness-state/tickets/T247/exploration.md`.
- Tests d'abord : rouges observés pour résolution du modèle, état de disponibilité, cause sur la perte audio, bannière Mac/TV et exposition IPC ; sorties `*-red.log` puis `*-green.log` dans le dossier d'état.
- `node --test tests/session-providers.test.cjs` : 15 tests verts ; `node --test tests/local-transcriber.test.cjs` : 2 tests verts ; `node --test tests/portable-config.test.cjs` : 3 tests verts. Les vues et l'hôte Mac ont leurs tests ciblés verts.
- `node scripts/check.mjs --changed` : vert, 130 tests. Premier passage rouge sur deux lignes longues corrigées ; aucun test affaibli.
- App empaquetée : son ancien chemin par défaut est conservé ; sans budget configuré, il dépend encore du dossier courant. Le serveur et l'app de développement résolvent depuis la racine de l'application. Le script d'installation suit cette même racine ; il n'a pas été exécuté (pas d'installation autorisée).
- Premier `node scripts/check.mjs` : rouge sur le témoin HTTP figé, qui ne contenait pas les nouveaux champs additifs ; 2466/2467 tests JS verts et 47 tests Python verts. Le témoin est mis à jour sans retirer de champ historique ; le scénario injecte une disponibilité simulée. `node --test tests/server-state-views.test.cjs` : 6 tests verts.
- Preuves renforcées : silence réussi par un binaire simulé jusqu'aux deux vraies vues, aucune perte audio ni bannière ; résolution d'un nom de binaire via PATH, lectures de disponibilité sans nouveau contrôle disque ; indicateur compact Mac et effacement après reconfiguration. Rouges observés pour les corrections, puis verts ; `node --test tests/session-providers.test.cjs` : 16 tests verts avant ajout de la caractérisation empaquetée ; `node --test tests/local-transcriber.test.cjs` : 3 tests verts.
- Dernier `node scripts/check.mjs --changed` : vert, 133 tests, règles/format/lint/gel/cliquet verts. Le contrôle complet final inclut aussi la caractérisation du chemin empaqueté.
- Contrôle final `node scripts/check.mjs` : **vert**, 2 471/2 471 tests JS (138 fichiers), 47/47 tests Python ; règles, format, lint, gel et cliquet verts. Sortie : `.harness-state/tickets/T247/check-full-final.log`. `git diff --check` : sortie 0, aucune erreur.
- Livraison : modèle indépendant du dossier de lancement et du répertoire du budget, priorité explicite conservée ; vérification au démarrage de chaque hôte, causes publiques codées, pertes audio codées, avertissement durable Mac/TV et indicateur flottant. Aucun avertissement pour une transcription réussie vide. Verdict et commandes dans le dossier d'état ; aucun commit ni push.
- À l'orchestrateur après intégration : vérifier en réel les transcriptions sur le Mac depuis un worktree, puis consigner le résultat ici. Cet essai réel et l'app empaquetée n'ont pas été exécutés par cette session.
- Reprise après `relecture-1.md` : rapport, ticket/journal, écarts, état Git et diff relus ; nouveau témoin hooks présent. Les cinq constats mineurs sont acceptés. Les corrections commencent par la reproduction du test depuis `tests/`, puis des preuves contrôlées pour PATH et la notification refusée.
- Correction des constats 1 et 2 : depuis `tests/`, `node --test --test-name-pattern='transcription defaults use' session-providers.test.cjs` reproduit le rouge puis passe après correction de l'attendu avec `__dirname`. `node --test --test-name-pattern='availability reads' tests/local-transcriber.test.cjs` reproduit le mauvais binaire, puis passe avec un `whisper-cli` temporaire placé en tête du PATH et restauré dans `t.after` ; les paroles du faux binaire sont vérifiées.
- Correction du constat 3 : les tests de notification refusée et de transmission du port passent du rouge au vert. `onPublicationError` est injecté dans le transcripteur et raccordé au journal des deux hôtes et de la composition autonome ; son échec ne modifie pas l'état de transcription. `node --test tests/local-transcriber.test.cjs` : 5 tests verts ; `node --test tests/session-providers.test.cjs` : 18 tests verts. Sorties `revision-*-red.log` et `revision-*-green.log` dans le dossier d'état.
- Correction des constats 4 et 5 : contrats `PerceptionResult.code`, `MemoryPassage.audioFailureCode` et `MemoryCoverage.audioGaps[].code` documentés ; imports du transcripteur regroupés avant constantes et fonctions. Pas de test de texte source ajouté.
- `node scripts/check.mjs --changed` après corrections : **vert**, 137 tests JS ; règles, format, lint, gel et cliquet verts. `git diff --check` : sortie 0.
- Contrôle complet après correction de la première relecture : `node scripts/check.mjs` **vert**, 2 474/2 474 tests JS (138 fichiers), 47/47 tests Python ; règles, format, lint, gel et cliquet verts. Sortie : `.harness-state/tickets/T247/revision-check-full.log`. Les cinq constats mineurs sont corrigés ; nouveau verdict `TERMINÉ` écrit pour la boucle, sans commit ni push.

### Réserves à la clôture

- Essais matériels et mise en page native non exécutés pendant cette session ; validation après intégration à réaliser par l’orchestrateur.
- .harness-state/tickets/T247/relecture-2.md : **6. `runtime/session-providers.cjs:65` (hors périmètre).**
  - En développement, `__dirname/../.local/models` désigne le dossier du checkout, comme le faisait déjà l'ancien chemin dérivé du budget.
  - Le cas observé (un worktree sans `.local/models`) sera donc signalé « modèle introuvable » au lieu d'être silencieux, mais il ne sera pas transcrit.
  - **Conséquence :** la vérification réelle prévue par l'orchestrateur (« passages transcrits depuis un worktree ») échouera sans modèle dans le worktree ou sans `TVLENS_WHISPER_MODEL`.
  - C'est conforme au périmètre écrit. C'est le diagnostic du ticket qui est inexact.
- .harness-state/tickets/T247/relecture-2.md : **7. `adapters/config.cjs:43` (hors périmètre).**
  - La branche du cache chiffré, avec `safeStorage` disponible (le cas normal de l'app empaquetée), ignore toujours `TVLENS_WHISPER_MODEL` et `TVLENS_WHISPER_BINARY` au démarrage.
  - Ce n'est pas une régression.
- .harness-state/tickets/T247/relecture-2.md : **Écart accepté, critère 1 (modèle lié au budget)** : la décision de la relecture 1 est maintenue. L'assertion qui figeait le comportement retiré est remplacée par une assertion d'indépendance de même force.
- .harness-state/tickets/T247/relecture-2.md : **Écart accepté, périmètre (app empaquetée et essais réels)** : maintenu. Le chemin empaqueté est conservé, décrit par `:629-638` et signalé dans le journal.
- .harness-state/tickets/T247/relecture-2.md : **Écart accepté, critère 1 (complément `loadConfig` sans fichier)** : maintenu, avec la réserve 7.
- .harness-state/tickets/T247/relecture-2.md : **Écart accepté, critère 4 (témoin HTTP figé)** : maintenu. Les champs ajoutés n'enlèvent rien, et l'ordre des champs historiques reste vérifié.
