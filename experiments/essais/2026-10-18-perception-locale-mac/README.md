# Essai du 18/10/2026 — perception locale sur le Mac (Ollama, gemma3 4B et 12B)

Premier essai exécuté de ce dossier. Sonde de composant, pas un banc : six passages, une exécution par modèle, sans
annotation humaine. Les chiffres valent pour cette machine, ce moment et cette charge ; ils ne prédisent ni le GX10 ni
la qualité sur d'autres contenus.

## Question

La perception de production, branchée sur un modèle local par `TVLENS_PERCEPTION_BACKEND=local`, fonctionne-t-elle
contre un vrai serveur Ollama (jusqu'ici, seulement contre un faux serveur dans les tests) ? Tient-elle le rythme d'un
passage Mac, et que décrit-elle par rapport à la référence Codex ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `e2696c2` (tag local `recette-t233`), chemin réel : `createSessionPerception` (`runtime/session-providers.cjs`) → `CodexPerception.observeVisual` (prompt, sélection et validation du produit) → `LocalVlmAgent` → Ollama `/api/chat` |
| Réglages | `perceptionBackend: local`, `localVlm: { url: 127.0.0.1:11434, model, keepAlive: 2m }`, taille de contexte et délai par défaut (45 s) |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, macOS (Darwin 25.3.0) |
| Runtime | Ollama 0.33.2 |
| Modèles | `gemma3:4b` (4,3 B, Q4_K_M, id `a2af6cc3eb7f`) ; `gemma3:12b` (12,2 B, Q4_K_M, id `f4031aab637d`) |
| Entrées | session Mac `ec55a89c` du 17/10 (live YouTube en français, commentaire politique) ; les six premiers passages prêts ; 6 images par passage (chemin Mac) ; durées 2,0 / 8,0 / 8,0 / 8,0 / 5,1 / 8,0 s |
| Transcript | celui de l'archive (Whisper local du 17/10), figé ; aucune transcription relancée |
| Contexte | vide (aucun sujet précédent) : chaque appel ouvre un fil neuf, contrairement à une session réelle |
| Référence | les observations Codex archivées le 17/10 pour les mêmes passages (modèle Codex non relevé) |
| Charge | la boucle tournait (T230). Mémoire libre 47–52 % avant, 32 % après le 4B, 26 % pendant le 12B ; swap passé de 14 à 25 Go |
| Reproduire | `node sonde.cjs <modèle> <nombre> <session>` depuis ce dossier ; résultats bruts dans `resultats-*.json` |

## Résultats

Les 12 appels ont abouti, avec un format valide, et le backend réel (`ollama`, modèle, hôte) est consigné dans les
métriques. Temps en millisecondes, mesurés par la sonde et décomposés par Ollama :

| Passage | 4B total | 4B chargement | 4B prompt+images | 4B génération | 12B total | 12B chargement | 12B prompt+images | 12B génération |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| moment-1 | 9 928 | 3 687 | 4 449 | 1 708 | 14 333 | 4 709 | 5 751 | 3 808 |
| moment-2 | 6 028 | 4 | 4 082 | 1 766 | 10 491 | 5 | 6 274 | 3 832 |
| moment-3 | 5 320 | 4 | 4 237 | 1 003 | 12 646 | 6 | 6 884 | 5 103 |
| moment-4 | 6 086 | 5 | 4 251 | 1 751 | 13 426 | 11 | 6 913 | 5 608 |
| moment-5 | 6 970 | 4 | 4 615 | 2 195 | 12 857 | 7 | 6 807 | 5 407 |
| moment-6 | 6 568 | 5 | 4 506 | 1 967 | 11 533 | 6 | 6 927 | 3 933 |

Environ 2 310 jetons de prompt par appel (six images et le texte), 100 à 220 jetons générés.

## Lecture

- **Le branchement tient en réel.** Rien à corriger côté format avant le GX10.
- **Rythme.** Le 4B tient sous la durée d'un passage de 8 s (5,3 à 7,0 s à chaud) ; le 12B la dépasse (10,5 à 14,3 s) :
  sur ce Mac, il accumulerait du retard en visionnage. L'encodage des images et du prompt domine (4 à 7 s).
- **Démarrage froid.** Le premier appel inclut 3,7 à 4,7 s de chargement des poids, mais `coldStart` reste `false`
  dans les métriques : défaut connu, traité par T255.
- **Qualité, impression non notée.** Les deux modèles décrivent bien l'image (personne, studio, écran ; le 12B lit
  exactement un titre à l'écran, le 4B le lit mal : « réparties » au lieu de « réprimée »). Ils résument beaucoup moins la
  parole que Codex : la référence rend surtout ce que dit l'intervenant, avec ses incertitudes ; les modèles locaux
  décrivent surtout « un homme devant un micro ». C'est l'écart à mesurer en G2, avec annotations figées.

## Limites et incidents

- Six passages, une seule exécution, ordre fixe (4B puis 12B), contexte vide : aucune statistique, aucun p95.
- Aucune annotation humaine : la lecture de qualité est une impression, pas un score (voir T258).
- Le modèle de 27B (`qwen3.8:27b`, 17 Go) n'a pas été essayé : mémoire insuffisante avec la boucle en marche.
- **Incident :** l'essai a tourné pendant que la boucle finissait T230. Le contrôle d'arrêt de T230 (240 s) a dépassé son
  budget sous cette charge et la tentative a été refusée. Les prochains essais locaux se font boucle arrêtée.
