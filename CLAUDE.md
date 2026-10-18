# TVLens — consignes pour Claude Code

Compagnon de visionnage : app Electron (Mac), serveur Node headless, companion LG webOS, scripts Python
côté TV. Présentation dans `README.md`, architecture dans `docs/architecture.md`.

## Avant de modifier du code

1. Lis `docs/standards.md` : ce sont les règles, et la plupart sont vérifiées par une machine.
2. Lis le code que tu vas toucher en entier, ses appelants et ses tests. Lis les ADR de `docs/adr/` qui
   concernent la zone.
3. Pour traiter un ticket de `docs/travail/tickets/`, une session Claude suit la skill `ticket` ; une
   session Codex suit `.agents/skills/ticket-codex/SKILL.md`.

## Frontières

- `core/` : règles applicatives, sans import externe ni accès disque, réseau ou `process`.
- `adapters/` : implémentations des ports. `runtime/` : composition partagée par les deux hôtes.
- `app/` (Electron), `server/` (HTTP pour la TV), `mcp/`, `tv/` : hôtes et présentation.
- Une logique commune aux deux hôtes vit dans `runtime/`, jamais en double dans `app/main.cjs` et
  `runtime/headless-runtime.cjs`.

## Contrôler

```sh
node scripts/check.mjs --changed   # fichiers modifiés : règles, cliquet, tests modifiés
node scripts/check.mjs             # tout, tests en séquentiel
```

Un contrôle « non lancé » n'est pas un contrôle réussi : dis-le tel quel. Ne déclare jamais un résultat
que tu n'as pas observé.

## Ce qui ne se fait pas

- Affaiblir ou supprimer un test, ou relancer un test instable jusqu'à ce qu'il passe.
- Modifier le harnais (`.claude/`, `.codex/`, `.agents/`, `scripts/check.mjs`, `scripts/quality/`, `scripts/loop/`) ou le
  plancher du cliquet pour faire passer un contrôle.
- Nommer un fichier, un test ou un commentaire d'après un ticket ou un chantier (« F07 », « T012 ») :
  le code décrit un comportement, l'historique vit dans Git et dans les tickets.
- Committer ou pousser sans demande. Pendant un ticket, c'est la boucle qui intègre.
- Lancer un script `*:live` (fournisseurs réels, quota), toucher à la TV, au VPS ou aux identifiants.

## Machine

Mac M5 Max, 36 Go de mémoire unifiée : quatre sous-agents au plus à la fois, un navigateur et Electron
ensemble si besoin. Un modèle local (Ollama) ou une charge lourde ne tourne jamais pendant un contrôle
chronométré, boucle comprise : le 18/10, un modèle de 12 milliards de paramètres a fait dépasser son budget
au contrôle d'arrêt d'un ticket. Un échec sous charge se reproduit et s'explique avant d'être écarté.

## Essais réels

Tout essai réel laisse une trace pour le rapport : recette sur la TV ou le VPS, contrôle réel sur le Mac,
sonde d'un modèle ou d'un fournisseur. Un dossier `experiments/essais/<date>-<sujet>/` contient un README
(question, configuration exacte, résultats, lecture, limites et incidents), les résultats bruts et les
scripts ; une ligne s'ajoute à `experiments/essais/README.md`. Ces fichiers se déposent boucle arrêtée : les
règles par fichier lisent aussi les scripts non suivis, et un fichier ajouté pendant un ticket peut faire
échouer son contrôle.

## Langue

Documentation, messages affichés à l'utilisateur et consignes : français. Identifiants de code, noms de
tests et messages de commit : anglais.
