---
id: T231
titre: Stop the loop clearly when the Codex quota is exhausted
statut: a-faire
bloque_par: T230
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un quota Codex épuisé remet le ticket à faire et arrête la boucle en donnant la reprise annoncée,
sans compter d'échec ni monter de palier. Ce ticket modifie le harnais ; le travail et les traces
restent en place, avec un message qui signale l'état de l'arbre laissé sur disque.

## Sources

- Plan du 17/10, T231, et relecture A, constats 5 et 6 : séparer l'arrêt pour quota de la relève
  sur Claude, livrée par T251. L'incident T208 n'avait produit aucun travail :
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/loop/events.jsonl:487` et `:490`
  comptent zéro tour et zéro jeton, en 72 s puis 4 s.
- Message réel : `/Users/Dabi/Documents/ISN/tvlens/.harness-state/loop/events.jsonl:488` et
  `:491` du dépôt principal ; apostrophe U+2019, date « Oct 22nd, 2026 8:41 AM » sans fuseau,
  URL dans le texte. Les JSONL bruts de T208 sont dans
  `/Users/Dabi/Documents/ISN/tvlens/.harness-state/archives/T208-quota-codex-1792226582141/etat/codex-1.jsonl:47-48`
  et dans `codex-2.jsonl:7-8` du même dossier : événements `error` puis `turn.failed`.
  Consultation en lecture seule.
- Code vérifié à `1d8aa48` : `scripts/loop/codex.mjs:105` traite `error` et
  `scripts/loop/codex.mjs:106` traite `turn.failed` sans catégorie quota ;
  `scripts/loop/codex.mjs:378` renvoie notamment `problem`. T230 livre la classification
  structurée et la reprise de capacité dans ce module.
- `scripts/loop/run.mjs:436` marque en cours, `:453` compte une tentative et `:478` finit par
  bloquer. Son en-tête `:15-16` documente les codes de sortie ; `:105-106` refuse un arbre suivi sale.
- Bancs : `tests/helpers/codex-session.cjs:94`, `tests/ticket-loop.test.cjs:2634` ;
  ADR 0012 pour l'indépendance de la relecture. T229 conserve verrou, lancement et compteurs.

## Périmètre

- Modifier `scripts/loop/codex.mjs`, `scripts/loop/run.mjs`, leurs helpers et
  `tests/ticket-loop.test.cjs`. Adapter les lecteurs de boucle si nécessaire pour rendre l'arrêt
  visible. Autorisation de harnais limitée à ces raccords, sans changement de permissions des agents.
- Reconnaître le quota seulement dans les événements Codex `error` et `turn.failed`. Propager
  une catégorie stable et une `reprise` bornée, absente représentée par `null`. Préférer les
  champs structurés établis ; la reconnaissance de phrase fournisseur reste dans ce décodeur.
  Ni contenu de fichier, ni sortie d'outil, ni réponse agent ne prouvent le quota. Distinguer
  débit passager, surcharge T230 et authentification ; ne pas classer tout 429.
- Un même refus livré par les deux événements produit une seule issue. Préserver T199 si le
  tour récupère et finit ; un échec terminal de quota prime sur une reprise de capacité.
  La reconnaissance accepte les deux apostrophes ; la reprise reste le texte annoncé. Garder
  la date sans inventer fuseau, échéance ou date locale quand sa normalisation est incertaine.
  Ne jamais recopier URL, secret ou message brut dans le diagnostic public.
- Intercepter cette issue avant l'ajout à l'historique des échecs : pas d'escalade, de blocage,
  de `tentative-refusee`, de contrôle/intégration, de relecture ni de rétrospective sur cette
  interruption. Remettre le ticket en `a-faire`, garder diff, journal et consommations des
  invocations déjà effectuées. L'arbre reste tel quel ; le message dit s'il contient du travail modifié.
- Émettre une fois `quota-epuise {ticket, reprise}` et un message français avec la reprise quand
  elle existe, sinon dire qu'elle n'est pas fournie. Documenter le nouveau code de sortie dans
  l'en-tête de `scripts/loop/run.mjs:15-16`. Libérer proprement l'enfant et le verrou.
- La relève Claude, son option et la reprise d'un arbre modifié appartiennent à T251. Ce lot
  ne change pas la garde d'arbre propre ni le mécanisme de relève de T229.

## Critères d'acceptation

1. Quota reçu par `error` seul, `turn.failed` seul et les deux : une seule issue, statut `a-faire`,
   aucune tentative refusée, aucun palier supplémentaire, aucune relecture ni commit ; le verrou
   est rendu. Le diagnostic donne la reprise annoncée ou son absence et un code de sortie documenté.
   Avant ou après écriture par le faux agent, le diff reste intact et son existence est signalée.
2. Une phrase identique dans un outil, un fichier ou une réponse ne change pas l'issue normale.
   Capacité T230, débit passager, 401 et erreur inconnue gardent leurs catégories. Les reconnexions
   récupérées et les échecs terminaux de T199 conservent leurs assertions. La fixture réelle T208
   avec U+2019 et sa variante ASCII sont reconnues sans diffuser l'URL ni interpréter le fuseau.
3. À l'implémentation, jouer `tests/ticket-loop.test.cjs` et les suites des lecteurs modifiés en
   séquentiel, puis `node scripts/check.mjs`. Aucun contrôle de revue, test ou plancher affaibli.

## Test d'acceptation attendu

Dans `tests/ticket-loop.test.cjs`, le faux Codex émet les deux formes d'événement quota avant
et après écriture d'un fichier. Le banc observe événement, statut, code de sortie, diagnostic,
diff conservé et absence d'escalade ; aucun moteur réel ni attente jusqu'à la date de reprise.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le message et sa provenance réels sont ceux de T208 cités ci-dessus : apostrophe U+2019,
date « Oct 22nd, 2026 8:41 AM » sans fuseau, URL dans le texte, événements `error` puis
`turn.failed`. La reconnaissance accepte les deux apostrophes ; la reprise reste le texte
annoncé. Les formes fournisseur non caractérisées ne sont pas devinées. Le lancement ordinaire
continue à refuser un arbre modifié ; sa reprise contrôlée sera livrée séparément par T251.

## Journal

- 18/10, orchestrateur : la première tentative a livré l'implémentation complète (2 661 tests JS et 47 tests Python
  verts) et ne s'est bloquée que sur un fichier hors dépôt : la sonde `experiments/essais/…/sonde.cjs`, déposée par
  l'orchestrateur avant le lancement, avait deux lignes de plus de 160 caractères. L'orchestrateur l'a corrigée ;
  `node scripts/check.mjs --changed` est vert sans ce ticket. Le travail est archivé dans
  `.harness-state/archives/T231-bloque-1/` : `code.patch`, `fichiers/scripts/loop/codex-quota.mjs`,
  `ticket-journal.patch` et `etat/` (preuves). Le réappliquer, le vérifier contre le code du moment, puis passer la
  relecture.
