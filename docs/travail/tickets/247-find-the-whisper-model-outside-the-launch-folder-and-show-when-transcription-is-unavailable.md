---
id: T247
titre: Find the Whisper model outside the launch folder and show when transcription is unavailable
statut: a-faire
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
