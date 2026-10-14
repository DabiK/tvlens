---
id: T145
titre: Hold the full remediation queue until the owner reopens it
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : il retient la file. Le 14/10, le propriétaire a choisi un plan
court pour la semaine du hackathon, treize tickets à forte valeur, à la place de la file complète des
127 tickets de dette. Les tickets hors du plan court gardent leur texte, mais chacun porte
T145 dans `bloque_par` : la boucle ne les prend pas tant que ce ticket n'est pas terminé.

## Sources

- Décision du propriétaire, le 14/10 : plan court plutôt que la file complète.
- Origine du code visé par les constats, mesurée par `git blame -w -M -C` à `8627b46` sur les lignes
  qu'ils citent : environ 60 % du code écrit pendant la nuit du 12 au 13/10 (instantané `70948a3`),
  25 % déjà là avant (`9758633`), 15 % écrit par les tickets F01 à F10.
- Le plan court est listé dans `docs/travail/tickets/INDEX.md`, section « Plan court ».

## Périmètre

- À modifier : rien. Ce ticket n'est pas lancé par la boucle, puisqu'il attend une décision.
- Pour rouvrir la file, le propriétaire, hors boucle :
  1. relit les tickets retenus contre le code du moment : le plan court déplace et découpe les fichiers
     qu'ils citent, leurs numéros de ligne et parfois leurs fichiers auront changé. En particulier,
     T066 et T073 décrivent la sauvegarde différée des questions dans `runtime/headless-runtime.cjs` ;
     T118 la déplace dans un module partagé par les deux hôtes : ils sont à réécrire contre ce module ;
  2. réécrit, retire ou garde chacun ;
  3. passe le statut de ce ticket à `termine`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose aucun ticket qui
   porte T145 dans `bloque_par`.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : rouvrir la file complète des tickets de dette, après le plan court,
en relisant d'abord les tickets retenus contre le code du moment.

## Journal
