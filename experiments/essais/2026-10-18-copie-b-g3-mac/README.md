# Essai du 18/10/2026 — trente minutes soutenues, tout en local sur le Mac (copie B, G3)

Recette T280 au commit `3c500b3`, tag `gx10-copie-b`. Première campagne G3 complète : une vidéo convertie envoyée au
rythme de la TV pendant trente minutes, huit questions à heure fixe, tous les rôles sur Ollama. Une exécution.

## Question

TVLens tient-il trente minutes de visionnage avec questions, tout en local, sans perdre de passages ? Où cède-t-il,
et le bilan de campagne (T261) permet-il de le dire ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `3c500b3`, `scripts/replay-local-stream.cjs` (T259) et son bilan (T261) |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée ; 22 h 54 à 23 h 24 |
| Source | `media/samples/kennedy-rice-7min.mp4` (domaine public), 7 min converties en 53 blocs de 8 s (T262), bouclées et déclarées : environ 7 minutes de contenu inédit pour 30 minutes de calendrier |
| Calendrier | 227 envois, transcription `en`, 8 questions à 1 min 30, 4 min 30, 8, 11 min 30, 15, 18 min 30, 22 min 30 et 27 min (`scenario.json`) |
| Rôles | perception et réexamen `gemma3:4b` ; questions `qwen3.8:27b` (contexte 16 384) ; embeddings `qwen3-embedding:0.6b` ; Whisper local ; Ollama 0.33.2 |
| Données brutes | `campagne.json` (rapport complet, 7,7 Mo) ; les médias et corps envoyés (500 Mo) ne sont pas recopiés |

## Résultats

| Mesure | Résultat |
| --- | --- |
| Campagne | `complete` ; 227 envois acceptés sur 227 ; archivage et libération confirmés |
| Identités | les cinq rôles identifiés locaux, `localMeasurement: true` |
| Audio | 227 passages transcrits, aucune perte, aucun trou |
| Vision | 157 descriptions ; 64 passages sautés par engorgement et 6 en erreur, soit 31 % sans description visuelle |
| Embeddings | deux lots coupés à 30 s au plus fort de la charge, signalés par `TVLENS_LOCAL_EMBEDDINGS_BATCH_FAILED` (T278) |
| Questions | 8 sur 8 répondues, 56 à 169 s chacune |
| Mémoire | 77 % libre au départ, 17 % au plus bas ; swap jusqu'à 26 Go |

Les sauts de vision se concentrent autour des questions : quand le 27B répond, la perception prend du retard et
le produit saute des passages plutôt que d'accumuler un retard sans fin.

Réponses, en résumé :

| Question | Réponse |
| --- | --- |
| De quoi parle l'orateur ? | l'accélération du progrès, citée avec la phrase sur Vénus |
| Quelles inventions cite-t-il ? | machine à vapeur, électricité, téléphone, automobile, avion, pénicilline, télévision, nucléaire, 4 citations |
| Que voit-on derrière l'orateur ? | drapeau et foule d'après les résumés ; réexamen sans observation retenue, dit tel quel |
| Pourquoi aller sur la Lune ? | « founder in the backwash of the coming age of space », « lead it », 5 citations |
| Le coût du programme spatial ? | `insufficient` : absent de l'extrait, juste |
| Qui est assis derrière lui ? | `insufficient` : aucune identité inventée |
| Résume les deux dernières minutes | l'espace sans conflit, l'ascension d'une montagne, 6 citations |
| A-t-il parlé de Mars ou de Vénus ? | Vénus, deux fois (dont la reprise de la boucle) ; Mars déclarée absente |

## Lecture

- **La chaîne G3 fonctionne** : calendrier tenu, aucun envoi perdu, bilan complet et attribué à chaque rôle.
- **Tout en local tient trente minutes sans perte audio**, et les réponses restent justes, citées et prudentes.
- **La vision est le maillon faible sur le Mac** : un tiers des passages perd sa description quand le modèle des
  questions tourne. C'est la mesure que le GX10 doit refaire, avec plus de mémoire et un parallélisme réel.
- **Les questions locales sont lentes** (1 à 3 minutes) : acceptables en réponse différée, pas en conversation.
- **Le réexamen par le 4B ne fournit pas de preuve exploitable** au modèle des questions ; un modèle de vision plus
  fort est à essayer pour ce rôle sur le GX10.

## Limites et incidents

- Une seule campagne, une seule source bouclée (7 minutes inédites), aucune annotation : pas de G2 sur ce contenu.
- Une vidéo convertie ne mesure ni la capture LG ni ses pertes avant livraison.
- La configuration choisie charge trois modèles sur 36 Go ; une configuration plus légère perdrait moins de vision
  mais ne serait plus « tout en local » pour les questions.
