---
id: T251
titre: Resume a quota-stopped ticket with Claude when asked
statut: a-faire
bloque_par: T231, T260
adr: oui
installe: non
harnais: oui
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le harnais accepte `--fallback-engine claude` : un quota Codex épuisé provoque alors une seule
relève sur Claude, sur le même ticket et le travail déjà écrit, avec revue et contrôles ordinaires.
Sans cette option, l'arrêt explicite de T231 reste inchangé.

## Sources

- Coupe de T231, relecture A, constat 5 ; ADR 0012/0014 et ADR de relève écrit par T229.
  T231 reconnaît le quota, émet `quota-epuise {ticket, reprise}`, remet le ticket en `a-faire`
  et arrête sans compter d'échec. T229 fournit la relève, le verrou et la continuité du lancement.
- Code vérifié à `1d8aa48` : `scripts/loop/run.mjs:36` ne connaît pas de secours ; `:105-106`
  refuse un arbre suivi sale, `:249` lance déjà une session Claude, `:436` marque le ticket
  en cours et `:453` compte une tentative. `scripts/loop/tickets.mjs:24` exclut le statut
  de la spécification figée. Relire ces chemins tels que T229/T230/T231 les ont livrés.
- `scripts/loop/models.mjs:50` choisit un palier d'après le numéro de tentative ; la bascule
  ne doit pas transmettre un nom de modèle Codex à Claude. Bancs :
  `tests/helpers/harness-repo.cjs:11`, `tests/helpers/codex-session.cjs:94`,
  `tests/ticket-loop.test.cjs:2634`.
- Incident quota réel : `/Users/Dabi/Documents/ISN/tvlens/.harness-state/loop/events.jsonl:488`
  et `:491`. T208 n'avait rien écrit (`:487`, `:490`, zéro tour/jeton) : le travail partiel
  est un cas à prouver par le banc, pas une propriété supposée de cet incident.

## Périmètre

- Modifier les options et la coordination de `scripts/loop/run.mjs`, l'aide de relève de T229,
  les helpers et `tests/ticket-loop.test.cjs`. Autorisation de harnais limitée au secours contrôlé ;
  aucune modification des permissions d'agent, des hooks ni des échelles de modèles pour obtenir le vert.
- Valider `--fallback-engine` avant lancement ; seul `claude` est accepté comme secours de Codex.
  Sur l'issue quota de T231, utiliser la relève de T229 pour reprendre ce ticket, sans retraiter
  un ticket terminé. Aucun cycle de bascules entre moteurs ; Claude ne reçoit pas ce secours.
- Traduire les options propres à Codex, notamment `--model` forcé, vers le palier Claude du niveau
  et des tentatives utiles déjà comptées. Documenter la traduction dans l'aide/ADR ; conserver
  les autres options effectives, budgets, cadence d'harmonisation, sorties et identité de lancement.
- Capturer un état de relève propre à ce travail : dépôt, branche, HEAD, ticket/spécification,
  chemins et empreintes du diff et des non-suivis préexistants. Le consommer une seule fois après
  validation. Ne pas autoriser globalement l'arbre sale, ni rebaptiser les nouveaux fichiers du
  travail en fichiers préexistants. Toute divergence refuse la relève et laisse le travail intact.
- Claude reçoit journal et diff. Son contrôle de confinement, sa relecture et tous les contrôles
  ordinaires conditionnent l'intégration de l'état réellement relu. Le quota ne consomme pas de
  tentative utile ; les consommations Codex et toutes les invocations restent dans les traces.
- Conserver `--max`, l'absence de push/rétrospective demandée et la propriété unique du verrou.
  Un lancement Claude refusé laisse ticket/fichiers récupérables et un diagnostic explicite ;
  aucun reset, stash ou commit de secours ne masque le diff.
- Écrire un ADR court de reprise contrôlée après quota, lié dans `docs/architecture.md`, section
  Décisions, et à l'ADR de T229. Ne pas réimplémenter la reconnaissance quota ni la reprise de capacité.

## Critères d'acceptation

1. Avec secours demandé, un quota après modification réelle du dépôt temporaire lance Claude
   exactement une fois sur ce ticket et ce diff. Les fichiers non suivis d'origine sont protégés ;
   les nouveaux fichiers du travail restent dans l'état à relire. Le quota ne consomme pas de palier.
2. La relève refuse HEAD, branche, spécification ou diff changé, état incomplet ou déjà consommé.
   Le lancement ordinaire continue à refuser un arbre sale ; aucun reset, stash ou commit de secours
   ne dissimule le travail. Un échec de démarrage Claude laisse ticket et fichiers récupérables.
3. Options invalides refusées avant agent ; options conservées et modèle Claude cohérent après
   bascule. Le contrôle, l'état relu et le relecteur du nouveau moteur conditionnent toujours
   l'intégration ; `--max` n'est pas réinitialisé. Les consommations Codex restent dans les traces.
4. Sans option, les assertions d'arrêt T231 restent identiques. Une seule instance détient le
   verrou ; journaux, compteurs, rétrospective et harmonisation ne sont ni perdus ni doublés.
5. À l'implémentation, jouer `tests/ticket-loop.test.cjs`, les tests de relève et des lecteurs
   modifiés en séquentiel, puis `node scripts/check.mjs`. Aucun contrôle, test ou plancher affaibli.

## Test d'acceptation attendu

Dans `tests/ticket-loop.test.cjs`, le faux Codex écrit un fichier puis émet le quota ; le faux
Claude de `harnessRepo` vérifie le même diff et produit un changement soumis à une vraie revue
du dépôt temporaire. Le banc observe arguments, empreintes, verrou, événements et intégration,
puis retient ou corrompt chaque frontière de relève. Aucun moteur, push ou dépôt réel n'est utilisé.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La relève après intégration de T229 ne suffit pas à autoriser un travail partiel : son extension
est précisément le livrable. La seule option demandée autorise cette reprise contrôlée sur Claude ;
elle n'assouplit jamais le démarrage ordinaire. Relire les interfaces réelles de T229 et T231.

## Journal

- 18/10, propriétaire : ticket hors du chemin GX10, repoussé après la copie B (T260). Dépendance d'ordre ajoutée
  (`T260`), sans lien de code ; la retirer rend l'ordre par numéro.
