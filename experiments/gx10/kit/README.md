# Kit des campagnes GX10 de TVLens

Trois jours d'accès root à une ASUS Ascent GX10 (GB10, ARM64, 128 Go unifiés) à partir du 20/10/2026. Le kit enchaîne
sans surveillance des campagnes qui font varier les modèles, les réglages et les vidéos, et garde tout.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `executeur.mjs` | Exécuteur des campagnes : relevé machine, modèles Ollama, préparations vidéo, campagnes, index ; reprise sans écrasement |
| `installer-gx10.sh` | Installation idempotente de la GX10 : paquets, Node 24, Ollama sur 127.0.0.1, whisper.cpp CUDA, poids Whisper, copies |
| `copies.bundle` | Paquet Git des copies figées (`gx10-copie-b`, puis `gx10-copie-c`) |
| `plan-gx10.json` | Plan des campagnes de la GX10 (à finaliser avec le corpus) |
| `plan-mac-validation.json` | Répétition à blanc sur le Mac, en validation seule |

## Campagnes

| Type | Runner de la copie | Mesure |
| --- | --- | --- |
| `g1` | `scripts/replay-local-perception.cjs` | perception d'images bloc par bloc : réussite, durée, jetons par seconde |
| `g3` | `scripts/replay-local-stream.cjs` | session soutenue au rythme de la TV : couverture audio et vision, pertes, questions et leur délai |
| `whisper` | `scripts/bench-whisper.cjs` | transcription : temps par fichier, fils, contexte, GPU ou non, par modèle Whisper |
| `command` | commande libre | sonde ponctuelle, sortie gardée comme le reste |

Chaque campagne a son dossier `campagnes/NNN-<id>/` : `parametres.json`, `config.env`, `scenario.json` (G3),
`sortie.log`, `erreurs.log`, `systeme.jsonl` (mémoire, swap, charge, GPU, modèles chargés toutes les 5 s),
`out/` (rapport complet du runner) et `resultat.json` (résumé). `index.jsonl` liste toutes les étapes, `etat.json`
dit ce qui tourne, `journal.log` raconte. Une campagne finie est sautée à la relance ; une campagne interrompue est
renommée `.interrompue-<horodatage>` et refaite à neuf ; `--refaire <id>` rejoue une campagne finie à côté de l'ancienne.

Par défaut, chaque campagne démarre à froid : les modèles chargés sont déchargés avant. En mode `ollama.mode:
"managed"`, l'exécuteur possède le serveur Ollama et le relance quand une campagne change ses réglages (`numParallel`,
`maxLoadedModels`, `flashAttention`, `kvCacheType`, `contextLength`).

## Sur la GX10

```sh
sudo bash installer-gx10.sh /srv/tvlens-gx10
node executeur.mjs plan-gx10.json verifier
tmux new -d -s campagnes 'node executeur.mjs plan-gx10.json lancer 2>&1 | tee -a /srv/tvlens-gx10/console.log'
node executeur.mjs plan-gx10.json etat
```

Arrêt propre : `tmux send-keys -t campagnes C-c` (les runners en cours reçoivent SIGTERM et gardent leur rapport).

## Règles

- Même SHA que la répétition Mac pour chaque copie ; un correctif impose un nouveau SHA et une nouvelle répétition.
- Rien de l'accès dans le dépôt ni dans les rapports (hôte, adresse, clés). Ollama n'écoute que sur 127.0.0.1.
- Aucun repli distant : tous les rôles sont locaux ; un rôle distant rendrait la campagne hybride.
- Le produit ne règle que `fr`, `en` et `auto` : une vidéo dans une autre langue est transcrite en détection automatique.
