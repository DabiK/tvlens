# Passation : campagnes GX10 et état du projet au 20/10/2026

Ce document permet à un agent qui n'a pas suivi les sessions précédentes de reprendre le travail : conduire les
campagnes sur l'ASUS Ascent GX10 et relancer la boucle de tickets. Il décrit l'état au 20/10/2026, 10 h, boucle en
pause. Les consignes du dépôt priment : `CLAUDE.md`, `docs/standards.md`, `docs/gx10-experiment.md`.

## Contexte

- TVLens est l'un des 8 finalistes de l'ASUS Ascent GX10 AI Developer Challenge. Le gagnant est annoncé le 24/10, sur
  le dossier déjà remis : la session GX10 ne change pas le verdict, sauf si ASUS accepte un complément (question
  ouverte, à demander par le propriétaire).
- La fenêtre d'accès à la GX10 dure trois jours à partir du 20/10, dans la journée. C'est un accès root, avec Internet ;
  le propriétaire (Dabi) transmet les accès. Objectif qu'il a fixé : tester un maximum d'approches (modèles, réglages,
  types de vidéos, langues) pour voir ce que la GX10 apporte à TVLens, **et tout garder**.
- Quotas au 20/10 : Claude hebdomadaire à 89 %, remis à zéro le 20/10 à 21:59 ; Codex épuisé jusqu'au 24/10 à 22:40.

## Ce que contient ce dossier

| Chemin | Rôle |
| --- | --- |
| `kit/README.md` | Mode d'emploi du kit : types de campagnes, sorties, reprise, règles |
| `kit/executeur.mjs` | Exécuteur des campagnes, sans dépendance : relevé machine, modèles Ollama tirés au fil du plan, préparations vidéo, campagnes G1 / G3 / Whisper / commande, mesures système toutes les 5 s, index, reprise sans écrasement |
| `kit/installer-gx10.sh` | Installation idempotente de la GX10 (Linux ARM64, root) : paquets, Node 24, Ollama (service système désactivé, l'exécuteur le pilote sur 127.0.0.1), whisper.cpp CUDA, poids Whisper, copies du code depuis `copies.bundle` |
| `kit/telecharger-corpus.sh` | Téléchargement des 20 vidéos du corpus sur la GX10 (accord du propriétaire du 19/10), avec manifeste `corpus.json` |
| `kit/corpus-propose.md` | Les 20 vidéos et les 10 de réserve, avec licences et preuves (CC BY, domaine public, Licence Ouverte) |
| `kit/ecrire-plan.py` | Génère `kit/plan-gx10.json` : 120 campagnes, par ordre de valeur |
| `kit/plan-mac-validation.json`, `kit/plan-mac-copie-c.json` | Répétition à blanc et répétition réelle sur le Mac |

Hors du dépôt : `/Users/Dabi/Documents/TVLens-GX10/kit/copies.bundle` (paquet Git des tags `gx10-copie-b` et
`gx10-copie-c`, à recréer par `git bundle create copies.bundle refs/tags/gx10-copie-b refs/tags/gx10-copie-c`), et les
répétitions dans `/Users/Dabi/Documents/TVLens-GX10/essais/`.

## Copies du code

| Tag | Commit | Usage |
| --- | --- | --- |
| `gx10-copie-b` | `70501e3` | Référence du Mac du 18/10 (30 min, `experiments/essais/2026-10-18-copie-b-g3-mac`) : rejouée une fois sur la GX10 (campagne `a1`) pour comparer à code identique |
| `gx10-copie-c` | `2035a2f` | Copie principale : son seul, raisonnement par rôle, modèle de réexamen dédié ; répétée sur le Mac le 19/10 (`experiments/essais/2026-10-19-repetition-copie-c-mac`) |

Les runners appelés (`scripts/replay-local-perception.cjs`, `scripts/replay-local-stream.cjs`, `scripts/bench-whisper.cjs`,
`scripts/prepare-video-replay.cjs`) sont identiques dans les deux copies. Un correctif impose un nouveau tag et une
nouvelle répétition sur le Mac.

## Conduire les campagnes sur la GX10

1. Obtenir du propriétaire le mode d'accès. **Ne jamais taper un mot de passe** : une clé SSH dédiée, ajoutée par lui.
   Rien de l'accès (hôte, adresse, clés) ne va dans le dépôt ni dans un rapport.
2. Copier sur la GX10 : `kit/` (avec `copies.bundle`) et les deux échantillons du dépôt
   `media/samples/kennedy-rice-7min.mp4`, `media/samples/spring.mp4` vers `/srv/tvlens-gx10/videos/`.
3. `sudo bash installer-gx10.sh /srv/tvlens-gx10` puis `bash telecharger-corpus.sh /srv/tvlens-gx10`.
   La conférence n° 18 donne une vidéo par piste audio, nommée d'après les étiquettes de langue relevées par ffprobe :
   vérifier les noms et ajuster `ecrire-plan.py` (`18-deu`, `18-eng`, `18-fra` supposés), puis regénérer le plan.
4. `python3 ecrire-plan.py /srv/tvlens-gx10`, puis `node executeur.mjs plan-gx10.json verifier` : les avertissements
   (vidéo ou poids absents) n'arrêtent que leurs campagnes, les problèmes bloquants arrêtent tout.
5. `tmux new -d -s campagnes 'node executeur.mjs plan-gx10.json lancer 2>&1 | tee -a /srv/tvlens-gx10/console.log'`.
6. Suivre : `node executeur.mjs plan-gx10.json etat` (campagne en cours, progression, dernières mesures). Arrêt propre :
   `tmux send-keys -t campagnes C-c`. Une relance reprend là où le plan s'est arrêté.
7. Ordre du plan : `a1` / `a2` (référence du Mac, copies B puis C), `b1` (tout poussé : Whisper large-v3-turbo, vision
   `gemma3:12b`, quatre requêtes Ollama en parallèle), banc Whisper GPU contre CPU, `b2` à `b5` (un axe à la fois, puis
   surcharge), `d-*` (9 modèles de vision × 9 vidéos), `c-whisper-*` (15 vidéos parlées), `e*` (sessions de 30 min par
   langue et type), `f*` (modèles de questions, réexamen, embeddings).
8. Après la fenêtre : rapatrier `campagnes/`, `index.jsonl`, `machine/`, `modeles.json`, `journal.log` (sans les médias
   de session), et écrire un dossier par série dans `experiments/essais/<date>-gx10-<sujet>/`, selon le modèle des
   essais existants (question, configuration exacte, résultats, lecture, limites et incidents).

## Pièges déjà rencontrés

- **`ollama pull` sur un modèle présent remplace ses poids** par la dernière version publiée. Le 19/10, `gemma3:4b` du
  Mac est passé de `a2af6cc3eb7f` (référence du 18/10) à `68ceab7e468a`. L'exécuteur ne retire plus un modèle présent,
  sauf s'il est listé dans `refreshModels`. La comparaison avec le 18/10 n'est donc pas à poids identiques pour la
  perception : le dire dans la fiche de `a1`.
- Le produit ne règle que `fr`, `en` et `auto` : les vidéos espagnoles, allemandes et italiennes passent en détection
  automatique de Whisper.
- Le scénario G3 n'accepte que ses clés de configuration ; le raisonnement par rôle et le modèle de réexamen dédié
  passent par le fichier `config.env` de la campagne (`TVLENS_LOCAL_*_THINK`, `TVLENS_LOCAL_INSPECTION_*`).
- Sur le Mac, un modèle local ne tourne jamais pendant un contrôle chronométré de la boucle.
- Les fichiers `.cjs`, `.mjs` et `.js` de `experiments/` sont lus par les règles par fichier du contrôle (lignes de
  160 caractères au plus) ; un essai se dépose boucle arrêtée.

## Boucle de tickets

- Branche `refactor/maintenabilite`, à `726db2d` (T226) plus ce versement ; `main` à `2035a2f` (= `gx10-copie-c`).
  `main` n'avance qu'à un point vérifié en réel : les tickets T303 à T309, T220 et T226 attendent le contrôle Netflix
  (T302) et la recette de la Mémoire (T281).
- **En pause depuis le 20/10 à 00:18**, T227 remis à faire. Relancer, arbre propre :
  `nohup caffeinate -i node scripts/loop/run.mjs --engine claude --max 60 >> .harness-state/loop/vague1-1017.log 2>&1 &`.
  Après le 24/10 à 22:40 : `--engine codex --fallback-engine claude`. **Pendant qu'une relève est armée, ne rien
  committer pendant qu'un ticket tourne** : la relève exige un HEAD inchangé (refus du 19/10, rattrapé à la main).
- File : T227 → T232 → T252 → T293 → T294 → sélection (T007, T009, T010, T011, T012, T014, T022, T042, T045, T049, T050,
  T068, T091, T131, T140) → T295 → T296 → T310. Recommandation acceptée le 20/10 à reprendre : T007 (lanceur qui
  nomme un fichier de test bloqué) puis T232 et T252 avant T227 ; l'ordre se règle par `bloque_par`, et se vérifie par
  `validate` et `next` de `scripts/loop/tickets.mjs` (le module n'a pas de CLI).
- À trier à la reprise : les 6 réserves de T226 (`.harness-state/tickets/T226/relecture-*.md`, section « Réserves à la
  clôture » du ticket). Un constat hors périmètre non extrait (« nombre de constats discordant ») se lit dans le rapport.
- En attente d'une décision du propriétaire : T138, T145, T254, T266, T281 (après T227), T302 (contrôle Netflix, prêt :
  il lance Netflix lui-même ; déploiement VPS et TV avec sauvegarde et retour arrière).
- Outils d'orchestration (surveillance de la boucle, pause au ticket suivant, relance avec relève, dépôt des essais,
  déploiement et retour arrière TV et VPS de T302) : `/Users/Dabi/Documents/TVLens-backups/outils-orchestrateur-20261020/`.
  Leurs chemins internes visent l'ancien dossier temporaire de session : les adapter avant usage.

## Règles qui ne changent pas

- Ne jamais affaiblir ni supprimer un test, ni relancer un test instable jusqu'à ce qu'il passe : un échec se reproduit
  et s'explique. Le 19/10, T305 a vu ses douze derniers fichiers de tests annulés d'un coup, cause non établie
  (`experiments/essais/2026-10-18-journal-incidents.md`) : à rouvrir sur le lanceur à la prochaine occurrence.
- TV et VPS : jamais pendant que le propriétaire regarde, toujours depuis un tag, avec sauvegarde et retour arrière ;
  ne jamais lire ni changer les secrets d'appairage (`connection.js`, `connection.json`) ni lire `~/.codex/auth.json`.
- Tout essai réel laisse un dossier dans `experiments/essais/` et une ligne dans son index.
- Documentation et messages en français ; identifiants, tests et commits en anglais.
