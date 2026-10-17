---
id: T256
titre: Honor explicit Whisper paths when loading cached settings
statut: a-faire
bloque_par: T247
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

L'app Mac empaquetée, lancée sans `--config`, applique `TVLENS_WHISPER_MODEL` et
`TVLENS_WHISPER_BINARY` non vides même avec un cache chiffré. La copie lancée hors paquet ou
en headless passe déjà par l'import et n'est pas concernée.
Tranche B d'Astra : une session Codex, un commit, environ 1 h ; elle complète T247.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, B, « Honor explicit Whisper paths when loading cached settings »,
  base `beb9589` ; réserves de clôture de T247 sur le checkout sans poids et le cache chiffré.
- Code relu à `16be86b` : `adapters/config.cjs:11` fusionne fichier et environnement à l'import ;
  `:34` écrit le cache ; `:43` relit le fournisseur et filtre les remplacements de démarrage ;
  `:59` liste les réglages filtrés sans les deux chemins Whisper, pourtant lus par `:67` et `:68`.
- `app/main.cjs:76-80` impose l'import hors paquet et utilise le cache dans l'app empaquetée
  sans `--config` ; `server/main.cjs:27` impose toujours l'import en headless.
- `runtime/session-providers.cjs:49-66` compose le transcripteur avec `config.whisperBinary` (`:56`) ;
  `:63` choisit le modèle explicite, sinon le chemin empaqueté ou celui du checkout.
- `tests/portable-config.test.cjs:35` ne vérifie les deux chemins qu'avec chiffrement indisponible ;
  `tests/session-providers.test.cjs:99` vérifie les options reçues par le transcripteur.
  `tests/review-regressions.test.cjs:250` et `:408` couvrent cache et import ;
  `tests/media-asr-options.test.cjs:149` couvre les réglages Whisper.
  ADR 0019 ; conserver les diagnostics de disponibilité et pertes audio livrés par T247.

## Périmètre

- À modifier : `adapters/config.cjs`, `tests/portable-config.test.cjs` et les preuves de composition
  dans `tests/session-providers.test.cjs` si nécessaires. Le raccord produit existe déjà.
- Appliquer les deux remplacements non vides `TVLENS_WHISPER_MODEL` et `TVLENS_WHISPER_BINARY`
  au démarrage depuis le cache avec fournisseur ou le cache de seuls réglages.
  Une variable absente ou vide laisse les chemins du cache ; l'import garde son comportement.
  Le chargement du cache n'écrit rien ; ne pas changer ce que l'import enregistre.
- À ne pas toucher : choix du moteur/modèle, langue, chemin empaqueté par défaut, recherche
  automatique dans les autres worktrees, diagnostics T247, capture, secrets ou autres réglages.
- Aucun essai réel dans la session Codex, y compris Whisper et modèle local. Les transcriptions
  sur le Mac, le GX10, la TV, le VPS et tout fournisseur réel sont des étapes de l'orchestrateur
  ou du propriétaire. Aucune installation n'est autorisée par ce ticket.

## Critères d'acceptation

1. Une doublure réversible de `safeStorage` prouve la priorité des deux variables non vides dans
   quatre situations : cache fournisseur, cache de seuls réglages, import de fichier et absence
   de cache. Les chemins choisis sont transmis à la fabrique réelle de transcripteur.
2. Au démarrage depuis le cache, une variable absente ou vide laisse les chemins du cache ;
   l'import garde son comportement. Les autres réglages et l'absence de clé restent inchangés.
3. Un démarrage depuis le cache n'écrit rien (`adapters/config.cjs:39-46`) ; un second démarrage
   sans environnement retrouve les chemins du cache. Ce que l'import enregistre
   (`adapters/config.cjs:34`) reste inchangé, et un test le caractérise.
4. Les preuves existantes de T247 distinguent toujours binaire absent, modèle absent et silence
   réussi ; le correctif ne transforme aucun échec de transcription en silence.
5. À l'implémentation future, jouer en séquentiel `portable-config`, `session-providers` et
   `local-transcriber` sous `tests/` (`.test.cjs`), ainsi que les régressions de
   `tests/review-regressions.test.cjs:250` et `:408` et de `tests/media-asr-options.test.cjs:149`,
   puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Étendre `tests/portable-config.test.cjs` via `loadConfig()` avec répertoire temporaire et cache
chiffré par une doublure. Enchaîner import, remplacement de démarrage et rechargement sans
remplacement depuis le cache, en vérifiant l'absence d'écriture sur cette voie et en caractérisant
séparément les chemins enregistrés par l'import ; transmettre le résultat à `createSessionTranscriber`
avec constructeur enregistré, sans lancer Whisper. Garder les preuves de diagnostics de T247.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T247 est terminé ; ce ticket corrige sa réserve du cache, sans prétendre fournir les poids manquants
à un worktree. La correction retenue par l'orchestrateur conserve le comportement de l'import,
y compris sa persistance ; elle ne demande aucune décision au propriétaire. T256 corrige l'app
empaquetée ; il n'est pas sur le chemin de la copie. La procédure T260 consigne les chemins Whisper
explicites, déjà honorés à l'import, et leur vérification externe.

## Journal
