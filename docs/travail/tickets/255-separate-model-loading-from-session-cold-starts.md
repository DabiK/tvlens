---
id: T255
titre: Separate model loading from session cold starts
statut: a-faire
bloque_par: T264
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

L'expérimentateur distingue l'attente dans l'agent local, l'aller-retour HTTP et les durées
annoncées par Ollama. Un chargement de poids ne devient jamais un nouveau fil Codex ni une
preuve automatique de démarrage froid. Tranche A d'Astra : une session Codex, un commit, 1–2 h estimées.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, A, « Separate model loading from session cold starts »,
  établi à `beb9589`. Les trois analyses GX10 antérieures distinguent déjà intégration et mesure réelle.
- Code relu à `16be86b` : `adapters/local-vlm-agent.cjs:33-36` sérialise les appels ; `:46` démarre
  le chronomètre après cette attente ; `:67-68` extrait les durées fournisseur ; `:71` impose
  `coldStart: false` et `connectMs: 0`. `:58` refuse une réponse après abandon, même si le transport répond.
- `adapters/codex-perception.cjs:178` remet le compteur à un sur `coldStart === true` ;
  `:219` normalise ce booléen et `:221` en déduit aussi `threadReset` ; `:225` relaie les métriques locales.
- `tests/local-vlm-agent.test.cjs:43` couvre contrat et durées ; `:75` couvre la sérialisation ;
  `tests/codex-thread-rotation.test.cjs:337-350` couvre les métriques et `:281-335` la rotation de contexte.
  ADR 0008, 0019 et 0031 ; T124/T125 sont terminés, sans nouveau prérequis de phase 2.

## Périmètre

- À modifier : `adapters/local-vlm-agent.cjs`, la propagation dans `adapters/codex-perception.cjs`,
  leurs tests de contrat et de rotation, et la documentation du contrat des métriques dans le code.
- Injecter l'horloge nécessaire aux mesures déterministes. Mesurer séparément attente depuis
  `answer()` et durée de requête jusqu'à lecture complète du corps ; conserver les valeurs brutes
  fournisseur et leurs unités. Nommer les champs et leur sens sans changer celui des métriques Codex.
- Représenter explicitement l'état de chargement inconnu du modèle local, distinct de la connexion
  et du fil. Le rendre disponible aux rapports futurs T257/T259 ; ne jamais le déduire d'un seuil
  sur `loadMs`. Une valeur non annoncée ne devient ni zéro ni « chaud ».
- Préserver la protection contre les métriques usurpées par le JSON du modèle, les refus codés,
  la sérialisation, l'annulation, les échéances et la fermeture.
- À ne pas toucher : prompt, contexte admissible, politique de nouvel essai, files, plafonds,
  cycle de vie ou choix de fournisseur. Aucun nouvel adaptateur ni déplacement de famille.
- Aucun essai réel dans la session Codex, modèle local compris. Répétition Mac, GX10, TV, VPS
  et fournisseurs réels restent à l'orchestrateur ou au propriétaire, hors boucle.

## Critères d'acceptation

1. Avec horloge injectée et transport retenu, deux appels concurrents donnent pour le second
   une attente et un aller-retour distincts, sans chevauchement. Les durées absentes ou invalides
   restent inconnues ; un test vérifie aussi les conversions des durées annoncées par Ollama.
2. Par la vraie `CodexPerception.observeVisual`, chargement, évaluation du prompt, génération
   et mesures clientes arrivent inchangés dans les métriques. Un chargement positif ne remet
   pas le compteur de fil à un et ne crée pas de `threadReset` supplémentaire.
3. Les tests Codex conservent la distinction connexion froide, tour chaud, rotation et reconnexion.
   Pour Ollama, le rapport disponible à l'appelant garde un état de modèle inconnu, même si
   `coldStart` conserve une valeur de compatibilité liée à la connexion.
4. Annulation en attente ou en vol, timeout et fermeture refusent le travail concerné. Un corps
   livré après l'abandon ne produit ni observation ni métrique de réussite ; le prochain appel
   admissible garde le comportement existant. Les champs privés ne fuient pas dans les métriques.
5. À l'implémentation future, jouer en séquentiel `local-vlm-agent`, `codex-thread-rotation` et
   `architecture-f08` sous `tests/` (`.test.cjs`), puis `node scripts/check.mjs`. Aucun test affaibli.

## Test d'acceptation attendu

Étendre `tests/local-vlm-agent.test.cjs` par `answer()` avec horloge et transport maîtrisés,
puis par la couture vraie perception → agent local → faux Ollama. Retenir le premier appel,
avancer le temps, soumettre le second et vérifier les durées et la profondeur de fil visibles.
Les refus tardifs sont observés par la promesse publique, sans mesurer une vitesse réelle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le propriétaire a décidé le 17/10 de préparer le GX10 avant la phase 2 retenue par T254 ; la copie
sera prise après T227, répétée sur le Mac avant l'accès, avec `hackathon-rc` en repli. Ce ticket
peut avancer avant la fin de Mémoire. Le froid/chaud matériel relève du protocole de T260.
Le résidu durée cliente moins durée fournisseur n'est pas une mesure pure du réseau ; annuler
la requête HTTP ne prouve pas l'arrêt du calcul GPU. Aucun ADR nouveau n'est nécessaire.

## Journal

- 18/10, propriétaire : ordre de la copie GX10 A : questions et recherche locales d'abord (T263, T264), puis T255,
  T265, T257, T262, T258, T267. Dépendance d'ordre ajoutée (`T264`), sans lien de code ; la retirer rend l'ordre par
  numéro.
