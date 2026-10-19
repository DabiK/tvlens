---
id: T256
titre: Honor explicit Whisper paths when loading cached settings
statut: termine
bloque_par: T247, T268, T280, T284
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

- 18/10, propriétaire : ticket hors du chemin GX10, repoussé après la copie B (T260). Dépendance d'ordre ajoutée
  (`T260`), sans lien de code ; la retirer rend l'ordre par numéro.
- 18/10, propriétaire, sur l'avis d'Astra : la copie B (T259, T261, T260) et sa recette T280 passent avant ce
  ticket.
- 18/10, propriétaire : les réglages des modèles locaux (T282, T283) et leur contrôle T284 passent avant ce
  ticket.
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T256/exploration.md` ; défaut localisé au
  filtre de l'environnement sur la voie cache. Correction limitée à cette voie pour conserver la persistance
  historique de l'import. Aucun écart prévu ; tests de régression à écrire avant le correctif.
- 19/10, Codex : `node --test --test-name-pattern='cached Whisper paths' tests/portable-config.test.cjs`
  observé rouge : 2 échecs d'assertion sur les chemins (avec et sans clé), puis vert : 2/2 après ajout
  des seuls chemins au filtre de démarrage. Sorties `whisper-cache-red.log` et `whisper-cache-green.log`
  dans le dossier d'état.
- 19/10, Codex : `node --test tests/portable-config.test.cjs` réussi, 16/16 ; preuves ajoutées pour les
  quatre voies, les remplacements indépendants, les valeurs absentes/vides, la composition empaquetée,
  l'absence d'écriture et la persistance historique de l'import avec ou sans clé. Sortie
  `.harness-state/tickets/T256/portable-config-green.log`.
- 19/10, Codex : `node --test --test-concurrency=1 tests/session-providers.test.cjs tests/local-transcriber.test.cjs tests/review-regressions.test.cjs tests/media-asr-options.test.cjs`
  réussi : 52/52, aucune omission ; portable-config avait été joué juste avant. Les diagnostics binaire
  absent, modèle absent et silence réussi restent verts. Sortie `targeted-sequential.log` dans le dossier d'état.
- 19/10, Codex : `node scripts/check.mjs --changed` réussi : règles, format, lint, gel, cliquet et
  16 tests verts. Sortie `.harness-state/tickets/T256/check-changed.log`.
- 19/10, Codex : `node scripts/check.mjs` réussi en entier : règles, format, lint, gel et cliquet verts,
  2 965/2 965 tests JavaScript (153 fichiers), 54 tests Python réussis. Sortie
  `.harness-state/tickets/T256/check-full.log`. `git diff --check` réussi. Verdict `TERMINÉ` déposé
  dans le dossier d'état ; relecture et intégration laissées à la boucle, sans commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T256/relecture-1.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
