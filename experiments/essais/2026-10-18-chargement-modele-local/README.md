# Essai du 18/10/2026 — chargement du modèle local séparé du démarrage froid

Contrôle réel T270, après T255. Quatre passages, une exécution : les chiffres valent pour cette machine et ce moment.

## Question

Après T255, la perception locale sépare-t-elle l'attente dans l'agent, l'aller-retour HTTP et le chargement des poids
annoncé par Ollama, sans compter ce chargement comme un démarrage froid de session ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `9e84275` (T255), chemin `createSessionPerception` → `CodexPerception.observeVisual` → `LocalVlmAgent` → Ollama |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée, aucun processus Codex |
| Runtime et modèle | Ollama 0.33.2, `gemma3:4b` (Q4_K_M), déchargé au départ |
| Entrées | session `ec55a89c` du 17/10, quatre premiers passages prêts, six images chacun |
| Déroulé | passage 1 à froid, passage 2 à chaud, passages 3 et 4 envoyés ensemble (`sonde-chargement.cjs`) |
| Données brutes | `resultats.json` |

## Résultats

| Passage | Durée totale | Attente (`queueMs`) | Aller-retour HTTP | Chargement Ollama | `coldStart` |
| --- | --- | --- | --- | --- | --- |
| 1, à froid | 6,7 s | 0 | 6,7 s | 1,6 s | faux |
| 2, à chaud | 5,2 s | 0 | 5,2 s | 3 ms | faux |
| 3, ensemble | 4,6 s | 0 | 4,6 s | 4 ms | faux |
| 4, ensemble | 10,0 s | 4,6 s | 5,4 s | 4 ms | faux |

`modelState` vaut `unknown` : l'agent ne sait pas si le modèle était chargé, seule la réponse d'Ollama le dit.

## Lecture

- **Les trois durées sont séparées.** Le passage envoyé en même temps qu'un autre attend exactement la durée du
  premier, et cette attente ne gonfle plus son propre aller-retour.
- **Le chargement des poids n'est plus un démarrage froid** de session.
- Comparé à l'essai du matin (`2026-10-18-perception-locale-mac`), avant T255 : 3,7 s de chargement mélangés à la
  durée totale, sans attente mesurée. Le passage à chaud est aussi plus rapide (5,2 s contre 6,0 s), boucle arrêtée.

## Limites et incidents

- Quatre passages, une exécution, sans charge concurrente : aucun p95.
- Le chargement à froid (1,6 s) profite sans doute du cache disque ; un vrai premier chargement serait plus long.
