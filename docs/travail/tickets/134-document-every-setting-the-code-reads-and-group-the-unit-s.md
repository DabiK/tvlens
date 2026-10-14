---
id: T134
titre: Document every setting the code reads and group the unit's environment lines
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Dix réglages lus par le code ne figurent dans aucun exemple d'environnement. Qui installe un hôte ne peut
donc pas les connaître. Par ailleurs, l'unité systemd pose `TVLENS_PORT` après `EnvironmentFile=`, ce qui
laisse croire que cette ligne fixe le port, alors que `runtime.env` l'emporte.

Après ce ticket :

- chaque réglage lu figure dans un exemple, avec son effet réel ;
- un test échoue dès qu'un réglage nouveau est lu sans y être ;
- toutes les lignes `Environment=` de l'unité précèdent `EnvironmentFile=`, avec un commentaire qui dit la
  priorité.

Aucune valeur en service ne change.

## Sources

- Constats : OPS-15
- Fiche du lot : `docs/travail/fiches/livraison.md`, § 1.1, § 2 (test de couverture) et § 3, étape 1.
- Correction du relecteur, qui prime sur le constat : dix variables manquent, `OPENROUTER_AUDIO_INPUT`
  compris. Le test vise les réglages, pas tout nom `TVLENS_*` : `TVLENS_STORAGE_FULL`,
  `TVLENS_RECAP_CAPACITY` et `TVLENS_VISION_TRANSIENT` sont des codes d'erreur. DOC-15 (lot L10) propose
  le même test ; il n'y en a qu'un, celui-ci (fiche, § 7, décision 1).
- Code vérifié à la version `0d5a954` :
  - `adapters/config.cjs`, fonction `loadConfig` (l.7). Le fichier et l'environnement sont fusionnés par
    `{ ...file, ...environment }` (l.11). On y lit :
    - `OPENROUTER_AUDIO_INPUT` (l.14) : `'true'` donne `audioInput: true`, toute autre valeur `false`.
      Absente, `true` sauf pour le modèle `FREE_MODEL_WITH_UNVALIDATED_AUDIO` (l.6). Dans l'app, ce champ
      ne sert qu'au champ `audioInput` de la configuration rendue à la vue (`app/main.cjs:254`), qu'aucun
      fichier de `app/` ne relit. `OpenRouterAdapter` (`adapters/openrouter.cjs:9`) n'est construit que
      par des scripts ; `scripts/probe-live.cjs:18` relit lui-même `process.env.OPENROUTER_AUDIO_INPUT`
      (`'false'` coupe l'audio), et `scripts/evaluate-actions.cjs:9` fixe `audioInput: true` ;
    - `TVLENS_INSPECTION_STRATEGY` (l.21), défaut `native-slow`. Aucun module de production ne lit
      `config.inspectionStrategy`.
  - `adapters/config.cjs`, tableau `SWITCHES` (l.59-60), constante `LOCAL_VLM_TOKEN` (l.61) et fonction
    `switches(env)` (l.64-76) :
    - `TVLENS_WHISPER_AUDIO_CTX` : `auto` ou un entier ;
    - `TVLENS_PERCEPTION_BACKEND` : défaut `codex` ;
    - `TVLENS_LOCAL_VLM_URL`, `TVLENS_LOCAL_VLM_MODEL`, `TVLENS_LOCAL_VLM_NUM_CTX`,
      `TVLENS_LOCAL_VLM_KEEP_ALIVE` et `TVLENS_LOCAL_VLM_TOKEN`. Le commentaire l.55-58 précise que ces
      réglages sont lus dans le fichier puis dans l'environnement, et que le jeton n'est jamais enregistré.
  - `runtime/session-runtime.cjs:93` : un backend de perception autre que `codex` ou `local` arrête le
    démarrage.
  - `runtime/session-runtime.cjs:207` : `inspectionStrategy(smoke ? strategy : "sheets-diverse")`. En
    mode d'essai, `strategy` vient de l'argument `--inspection-strategy=` (`app/main.cjs:305`), pas du
    réglage. `TVLENS_INSPECTION_STRATEGY` est donc lu et sans effet, en essai comme en service.
  - `adapters/chat-trace.cjs`, fonction `trace` (l.40). La ligne 41 lit
    `process.env.TVLENS_CODEX_TRACE !== '1'`, donc l'environnement du processus seulement.
  - Codes d'erreur, déclarés comme constantes de chaîne :
    - `core/session.cjs:6` (`STORAGE_FULL`) et `:9` (`VISION_TRANSIENT`) ;
    - `core/living-recap.cjs:5` (`RECAP_CAPACITY`) ;
    - `adapters/disk-guard.cjs:4`, `adapters/codex-recap.cjs:5` et `adapters/codex-perception.cjs:16`.
    - `core/ports.cjs:12` en cite un dans un commentaire.
  - Autres formes de lecture, qu'un motif borné à `env.X` raterait :
    - `adapters/codex-confinement.cjs:226` (`parent.TVLENS_CODEX_REAL_HOME`) ;
    - `app/main.cjs:66` (`setting('TVLENS_MEDIA_RETENTION_MS')`) ;
    - `server/main.cjs:18` (`checked('TVLENS_MEDIA_RETENTION_MS', …)`).
  - Les noms `TVLENS_*` de `tv/app` sont des constantes JavaScript du panneau (`TVLENS_POLL`,
    `TVLENS_SESSION_ID`…), pas des réglages (correction du relecteur de DOC-15).
- Fichiers d'exemple :
  - `.env.example` : fichier de configuration du Mac, en français. Il a trois sections : « Réglages lus dans
    ce fichier », « Réglages d'hôte : lus dans l'ENVIRONNEMENT DU PROCESSUS seulement » et « Cloisonnement
    des agents Codex ».
  - `deploy/server.env.example` : fichier de configuration du serveur (`TVLENS_CONFIG`, unité l.14).
  - `deploy/runtime.env.example` : environnement du service.
- `deploy/tvlens.service` :
  - `Environment=` aux lignes 12-18 ;
  - `EnvironmentFile=/etc/tvlens/runtime.env` (l.19) ;
  - `Environment=TVLENS_PORT=8787` (l.20) et `Environment=PATH=…` (l.21) après lui.
  - `deploy/runtime.env.example:4` pose aussi `TVLENS_PORT=8787`.
- `tests/deploy-unit.test.cjs` :
  - l.12 : `setting(name)` exige une seule occurrence, donc ne peut pas lire les `Environment=` ;
  - un seul test (l.20).
- Relevé fait le 2026-10-14 par script sur `core`, `adapters`, `runtime`, `server`, `mcp` et `app` :
  - 39 noms cités ;
  - 13 absents des quatre fichiers : les 10 réglages ci-dessus et les 3 codes d'erreur.

## Périmètre

- À modifier :
  - `.env.example` et `deploy/server.env.example` : les neuf réglages lus par `loadConfig`
    (`OPENROUTER_AUDIO_INPUT`, `TVLENS_INSPECTION_STRATEGY`, `TVLENS_WHISPER_AUDIO_CTX`,
    `TVLENS_PERCEPTION_BACKEND` et les cinq `TVLENS_LOCAL_VLM_*`). Chacun est commenté (`# NOM=`), avec
    une ligne qui dit son défaut et son effet tels que le code les donne :
    - pour `TVLENS_INSPECTION_STRATEGY`, qu'il est lu mais sans effet aujourd'hui (le choix de stratégie
      passe par `--inspection-strategy=` en mode d'essai) ;
    - pour `OPENROUTER_AUDIO_INPUT`, qu'il ne change pas l'analyse de l'app ; seul
      `scripts/probe-live.cjs` en tient compte, et seulement depuis l'environnement du processus ;
    - pour `TVLENS_LOCAL_VLM_TOKEN`, qu'il n'est jamais enregistré et ne s'écrit jamais en clair dans un
      exemple.
    - Dans `.env.example`, ils vont dans la section « Réglages lus dans ce fichier ».
  - `deploy/runtime.env.example` : `TVLENS_CODEX_TRACE` commenté (`1` écrit une trace JSON par événement
    sur la sortie d'erreur). Dans `.env.example`, le même réglage va dans la section de l'environnement du
    processus.
  - Les nouveaux commentaires sont en français (consigne « Langue » de `CLAUDE.md`).
  - `deploy/tvlens.service` :
    - déplacer `Environment=TVLENS_PORT=8787` et `Environment=PATH=…` avant `EnvironmentFile=`, sans
      changer leur valeur ;
    - ajouter, juste au-dessus de `EnvironmentFile=`, un commentaire qui dit qu'une variable écrite dans
      `/etc/tvlens/runtime.env` l'emporte sur la même variable posée par `Environment=`.
  - `tests/deploy-unit.test.cjs` : un test de plus, sans toucher au test existant. Il vérifie qu'il y a
    exactement une ligne `EnvironmentFile=`, et qu'aucune ligne `Environment=` ne vient après elle ; il
    vérifie aussi que ce contrôle refuse un texte fictif où l'ordre est inversé.
- À créer : `tests/settings-examples.test.cjs`.
  - Il lit les sources `.cjs`, `.mjs` et `.js` de `core`, `adapters`, `runtime`, `server`, `mcp` et `app`
    (hors `node_modules`), et en extrait les noms `\b(TVLENS|OPENROUTER)_[A-Z0-9_]+\b`, commentaires
    compris. `tv/app` est exclu ; un commentaire du test dit pourquoi.
  - Il déclare `ERROR_CODES`, les trois codes d'erreur, et vérifie pour chacun deux choses : une source de
    production l'affecte comme constante de chaîne (`= 'NOM'` ou `= "NOM"`) ; aucun fichier d'exemple ne
    le cite. Ainsi la liste ne peut ni vieillir ni servir à cacher un réglage.
  - Tout autre nom doit figurer, en mot entier, dans `.env.example`, `deploy/server.env.example`,
    `deploy/runtime.env.example` ou `deploy/tvlens.service`. Le message d'échec nomme le réglage, un
    fichier qui le cite, et dit de l'ajouter à un exemple, ou à `ERROR_CODES` si c'est un code d'erreur.
  - Garde contre un test vide : les noms extraits contiennent `TVLENS_PORT`, `TVLENS_CODEX_TRACE` et
    `TVLENS_MEDIA_RETENTION_MS`.
  - La comparaison est une fonction du fichier de test, qui reçoit des textes (sources, exemples) et rend
    les manques. Un cas l'applique à une source fictive qui lit `env.TVLENS_SAMPLE_UNDOCUMENTED` et vérifie
    que le manque rendu nomme ce réglage : l'échec se prouve dans le test, sans toucher au code.
- À ne pas toucher :
  - le code de production : `adapters/config.cjs`, `adapters/chat-trace.cjs`,
    `runtime/session-runtime.cjs`, `server/` et `app/` ;
  - les valeurs posées par l'unité, `TasksMax`, `Restart` et `KillMode` ;
  - `docs/server-installation.md` : les scripts du § 3, étape 6, de la fiche la réécriront ;
  - `scripts/quality/` : le test ne réutilise pas `PROD_DIRS`, il liste ses dossiers ;
  - le VPS : l'unité installée ne change qu'à sa réinstallation par le propriétaire.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/settings-examples.test.cjs` passe.
2. `tests/settings-examples.test.cjs` contient le cas de la source fictive : la fonction de comparaison
   rend un manque qui nomme `TVLENS_SAMPLE_UNDOCUMENTED`. Un second cas fictif vérifie qu'un code
   d'erreur cité par un exemple est signalé.
3. `node --test tests/deploy-unit.test.cjs` passe, avec le test existant inchangé. Le nouveau contrôle est
   une fonction appliquée à l'unité réelle, et aussi à un texte fictif où `Environment=TVLENS_PORT=8787`
   suit `EnvironmentFile=` : ce texte est refusé, avec un message qui nomme la ligne.
4. Les variables posées par l'unité sont les mêmes qu'à la version de départ : la commande suivante ne rend
   rien.
   `diff <(git show HEAD:deploy/tvlens.service | grep '^Environment' | sort) <(grep '^Environment' deploy/tvlens.service | sort)`
5. `grep -c "TVLENS_LOCAL_VLM_TOKEN=[^ ]" .env.example deploy/server.env.example` rend 0 pour chaque
   fichier : aucun jeton n'est écrit.
6. `node scripts/check.mjs --changed` est vert. Format et lint sont rapportés « non lancés » s'ils le sont.

## Test d'acceptation attendu

`tests/settings-examples.test.cjs`, nouveau. Frontière : les sources de production et les quatre fichiers
d'exemple, lus comme textes. C'est un test de garde : le code lit ces réglages par plusieurs formes (fiche,
§ 1.1), et la fusion par décomposition de `loadConfig` empêche d'observer les lectures de l'extérieur. Le
second test, dans `tests/deploy-unit.test.cjs`, lit l'unité comme texte.

## Hypothèses bloquantes

Aucune décision n'est attendue.

- Les exemples décrivent le comportement actuel, y compris celui des réglages sans effet
  (`TVLENS_INSPECTION_STRATEGY`, et `OPENROUTER_AUDIO_INPUT` pour l'app). Les retirer du code ou les
  rebrancher est la décision 9 de la fiche, hors de ce ticket.
- La priorité `EnvironmentFile=` sur `Environment=` vient de `systemd.exec(5)` et n'est pas essayée ici : le
  journal la note comme non vérifiée sur un hôte.
- Si le lot L10 ou L11 a déjà créé un test de couverture des réglages : ce ticket l'étend au lieu d'en
  créer un second (règle A8), et le journal le dit.
- Si un nom extrait n'est ni un réglage ni un des trois codes d'erreur (constante d'un autre usage) :
  verdict BLOQUÉ, avec le nom et le fichier. Le classer est une décision.

## Journal
