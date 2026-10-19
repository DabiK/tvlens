---
id: T295
titre: Refuse an incomplete local model selection when the Mac imports settings
statut: a-faire
bloque_par: T294
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Sur le Mac, importer un fichier de réglages qui choisit un rôle local sans ce qu'il lui faut (URL, modèle) est refusé
tout de suite, avec un message qui nomme le réglage manquant, et l'app garde ses réglages précédents. Aujourd'hui,
l'import réussit sans rien dire et c'est le démarrage suivant qui échoue.

## Sources

- Décision du propriétaire, le 19/10 : faire un ticket des défauts relevés en recette (tri d'Astra, « Manques »).
- Réserve 2 de T263 (`.harness-state/tickets/T263/relecture-1.md`), constat du 18/10 à 11:57 : un import avec
  `TVLENS_QUESTIONS_BACKEND=local` sans URL ni modèle réussit ; au démarrage suivant, `createConversationRuntime`
  refuse et l'app affiche « TVLens ne peut pas démarrer » jusqu'à une correction à la main du fichier.
- Code à `11e601f` :
  - `app/main.cjs:287-292`, gestionnaire `app:import-config` : `loadConfig`, puis mise à jour des agents, sans
    recomposer ni valider la sélection des rôles locaux ;
  - `app/main.cjs:156`, `createConversationRuntime` au démarrage, et `:601`, la boîte « TVLens ne peut pas démarrer » ;
  - `adapters/config.cjs` : lecture des réglages `TVLENS_*_BACKEND` et `TVLENS_LOCAL_*` ;
  - `runtime/conversation-runtime.cjs` et `runtime/session-providers.cjs` : validation des sélections par rôle.
- Même famille de réglages : questions (T263), réexamen (T265, T283), embeddings (T264), raisonnement (T282).

## Périmètre

- À modifier : `app/main.cjs` (gestionnaire d'import seulement), le module qui valide déjà ces sélections au
  démarrage si une fonction doit en être exposée, et les tests qui couvrent la configuration du Mac.
- L'import valide la configuration lue avec la même règle que le démarrage, pour chaque rôle local : questions,
  réexamen, embeddings, perception. Une sélection refusée laisse la configuration en place et renvoie à la fenêtre une
  erreur en français qui nomme le réglage, par exemple « Réglage TVLENS_LOCAL_QUESTIONS_MODEL manquant pour les
  questions locales. ». Aucune règle de validation nouvelle : réutiliser celle du démarrage.
- Une configuration valide garde le comportement actuel.
- À ne pas toucher : le serveur headless, le format de `.env.local`, les messages du démarrage.
- Contrôle réel sur le Mac, par l'orchestrateur après intégration : importer un fichier incomplet, voir le refus,
  redémarrer l'app sans erreur.

## Critères d'acceptation

1. Import d'un fichier avec `TVLENS_QUESTIONS_BACKEND=local` sans modèle : refus nommant le réglage, configuration
   précédente inchangée ; le test échoue avant la correction.
2. Même chose pour le réexamen local et les embeddings locaux.
3. Import d'un fichier valide : configuration appliquée comme aujourd'hui.
4. `node scripts/check.mjs`.

## Test d'acceptation attendu

Un test de la configuration du Mac qui importe un fichier incomplet par la même fonction que le gestionnaire
`app:import-config`, sans fenêtre Electron.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
