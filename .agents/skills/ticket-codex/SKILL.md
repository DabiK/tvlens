---
name: ticket-codex
description: Traite un ticket avec Codex, tests d'abord, puis rend la main à la boucle pour la relecture Claude et l'intégration.
---

# Traiter un ticket avec Codex

Tu explores et implémentes toi-même. La boucle orchestre la relecture dans un processus Claude séparé.
Tu ne lances ni sous-agent ni relecteur, tu ne committes pas et tu ne pousses pas.

Dossier d'état : `.harness-state/tickets/<ID>/`, hors Git.

## 1. Cadrer et explorer

Lis `AGENTS.md` (lien vers `CLAUDE.md`), `docs/standards.md` et le ticket en entier.
Lis en entier le code cité, ses appelants, ses tests et les ADR concernant la zone.
Lis le journal, `git status`, `git diff` et les éventuels rapports d'échec avant une reprise.
Écris ton exploration dans le dossier d'état ; laisse un jalon dans le journal du ticket.

Si le code contredit le périmètre du ticket ou exige une décision du propriétaire, rends BLOQUÉ.
Avant toute implémentation, écris chaque écart prévu et sa raison dans `ecarts.md` du dossier d'état.
N'affaiblis jamais un critère ; un écart qui élargit le périmètre ou retire une preuve bloque le travail.

## 2. Implémenter, tests d'abord

Suis `.claude/skills/tests/SKILL.md` : un comportement à la fois, test rouge observé sur son assertion,
implémentation minimale, puis vert observé. Conserve les commandes et leurs sorties dans le dossier
d'état. Teste aux frontières publiques ; maîtrise disque, temps, réseau et fournisseurs.
Ne supprime ni n'assouplis un test pour passer. Respecte les autorisations du ticket (`harnais`,
`installe`, `supprime_tests`) et les restrictions explicites du propriétaire.

Un jalon par étape dans le journal : commande exacte et résultat réel. Rien au-dessus de `## Journal`
ne change. Si `adr: oui`, écris l'ADR au numéro suivant, avec `docs/adr/0000-gabarit.md`.

## 3. Reprendre après une relecture

La boucle transmet le rapport complet du relecteur dans la même session Codex.
Lis-le et corrige chaque constat bloquant et mineur, tests d'abord. Une contestation se déclare
avec sa raison dans `ecarts.md` ; le relecteur suivant tranche. Les constats hors périmètre deviennent
des réserves dans `reste`. Mets le journal à jour et rends un nouveau verdict.
N'enregistre pas toi-même l'état relu et ne lance pas de relecteur : la boucle s'en charge après toi.

## 4. Conclure

Avant de rendre la main, lance `node scripts/check.mjs` en entier, puis écris ton verdict.
Un contrôle rouge se corrige avec son test avant de conclure ; ne déclare jamais un résultat non observé.

Écris toi-même `.harness-state/tickets/<ID>/verdict.json` :

```json
{
  "statut": "TERMINÉ",
  "resume": "ce qui est livré",
  "preuves": ["commande et résultat observé"],
  "reste": []
}
```

`TERMINÉ` signifie que les critères sont couverts par les preuves disponibles ; la relecture reste
la responsabilité de la boucle. `PARTIEL` indique le travail utile livré et ce qui manque.
`BLOQUÉ` nomme la décision sans laquelle avancer est impossible. Un fichier refusé par le bac à sable
reste manquant : ne contourne pas la protection et ne le déclare pas livré.
Les réserves nomment les constats hors périmètre, les écarts à trancher et les vérifications manquantes.
La boucle conserve ton verdict, enregistre le changement, fait relire, puis décide de l'intégration.
