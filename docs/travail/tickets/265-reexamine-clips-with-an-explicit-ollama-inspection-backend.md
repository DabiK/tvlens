---
id: T265
titre: Reexamine clips with an explicit Ollama inspection backend
statut: a-faire
bloque_par: T255, T270
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le réexamen d'un clip peut utiliser le modèle vision local, indépendamment du backend des
questions et de la perception de fond. L'expérimentateur retrouve le backend effectif, les
preuves et les limites du réexamen dans les diagnostics. Une session Codex, un commit, avant GX10.

## Sources

- Décision du propriétaire du 17/10 au soir : réexamen local avant le GX10, derrière le port actuel.
- Code relu à `4599eea` : `runtime/session-providers.cjs:86-95` choisit un modèle simulé
  lorsque `localInspection` vaut vrai, sinon Codex. `:97-106` compose le vrai inspecteur
  et les planches `sheets-diverse` hors smoke ; `:111-115` place la révocation autour du cache.
  Le drapeau `localInspection` n'est donc pas un backend Ollama.
- `adapters/clip-inspector.cjs:12-58` extrait les images, conserve la portée des paroles,
  prépare les planches et appelle `model.inspect`. `adapters/inspection-strategies.cjs:31-62`
  prépare ces planches sans changer les règles du réexamen.
- `adapters/codex-perception.cjs:230-311` fournit déjà prompt, transcription et schéma
  d'inspection via un agent injectable ; `:267-271` envoie des images et `:305-311`
  conserve l'intervalle propre des paroles. Pas d'inférence sur vidéo native à ajouter.
- `adapters/local-vlm-agent.cjs:15-71` satisfait ce contrat d'agent ; T255 complète ses
  métriques. `core/video-tools.cjs:209-248` borne l'inspection, ses baux et ses preuves.
  `runtime/session-lifecycle.cjs:66-76` ferme séparément perception et modèle d'inspection.
- `tests/session-providers.test.cjs:157-204` caractérise smoke/live/localInspection ;
  `tests/local-vlm-agent.test.cjs:180-200` traverse déjà le rôle de perception et le faux Ollama.
  `tests/reinspection-transcript-reuse.test.cjs:43-56` fournit un faux décodeur.
- ADR 0004, 0019, 0029 et 0030 ; `docs/domaine.md:266-289` distingue rôle et plateforme.
  T263 livre les questions avec leurs outils ; il ne choisit pas ce modèle.
  T240 possède l'accès exclusif et la libération des questions, T250/T234–T245/T253 leur cycle.

## Périmètre

- À modifier : `runtime/session-providers.cjs`, `adapters/config.cjs`, propagation
  diagnostique dans le rôle d'inspection, `ClipInspector` et `VideoTools` si nécessaire,
  leurs tests ; créer `tests/local-inspection.test.cjs`.
  La sélection reste dans `createSessionInspection` (`runtime/session-providers.cjs:69-116`),
  à côté de celle de la perception ; `CodexPerception` et `LocalVlmAgent` suffisent.
  Réutiliser l'agent existant sans le déplacer ni recopier son transport.
- Ajouter `TVLENS_INSPECTION_BACKEND=codex|local` → `config.inspectionBackend`.
  La voie locale reçoit `config.localVlm`, déjà configuré par `TVLENS_LOCAL_VLM_*` :
  c'est le même choix de modèle vision pour cette première tranche, avec une instance distincte
  possédée par l'inspection. Le backend de perception reste sélectionnable indépendamment.
- Conserver le défaut historique Codex et refuser une valeur inconnue ou un local incomplet.
  Le choix local compose la vraie `CodexPerception` avec `LocalVlmAgent`, puis le vrai
  `ClipInspector`, son cache et sa révocation. Ni le nom historique du rôle ni
  `selectedModels.inspectionModel` Codex ne deviennent l'identité du modèle réellement appelé.
  L'inspection locale garde la limite de 45 s de `LocalVlmAgent` ; son dépassement est consigné
  comme tel (`adapters/local-vlm-agent.cjs:15`, `runtime/session-providers.cjs:118-128`).
- Conserver les modes de test existants : `localInspection` continue à désigner une
  simulation explicitement identifiée, jamais une preuve Ollama. La combinaison demandant
  simultanément simulation et mesure locale est refusée comme mesure réelle, sans en changer
  silencieusement le sens. Aucun repli Codex après panne du modèle local.
- Préserver stratégie de planches, images et paroles séparées, réutilisation des transcriptions,
  option `exactSpeech`, validation des observations, cache et révocation avant lecture du cache.
  Dans le cache, un changement de backend/modèle ne réutilise pas un résultat d'inspection
  d'une autre identité ; une observation réutilisée d'une question antérieure garde l'identité
  de son réexamen d'origine (`core/deep-ask.cjs:177`).
  Une erreur de transcription reste une limite, jamais une preuve de paroles.
- Transmettre rôle/backend/modèle effectifs et métriques disponibles T255 jusqu'au diagnostic
  d'appel `inspect_clip`, aux traces et aux rapports T259/T261. Un résultat en cache porte
  son identité d'origine et `cacheHit` ; il ne représente pas un nouvel appel au modèle.
  Le contrat `detail`, réservé aux compteurs (`core/video-tools.cjs:181`), s'étend à l'identité
  diagnostique de l'adaptateur, sans texte produit par le modèle.
  Une inspection non sollicitée est marquée non exercée ; la configuration seule ne la valide pas.
- Hors périmètre : modèle des questions T263, embeddings T264, surveillance T266, délais,
  limites de réexamen, concurrence de T240, retenue vision de T227, migrations de Mémoire
  T220/T224–T226, causes quota de T232 et affichage T252. Les phases déplacent les fichiers existants.
- Aucun essai réel dans la session Codex : faux Ollama, ffmpeg/Whisper doublés et fichiers
  temporaires. Modèle local, TV, VPS et fournisseurs restent à l'orchestrateur/propriétaire, hors boucle.

## Critères d'acceptation

1. Par la composition réelle et `VideoTools.call('inspect_clip', ...)`, une inspection
   sur médias temporaires traverse planches → rôle `inspect` → faux Ollama et fournit
   une observation admissible avec l'identité locale. Aucun agent ou client du backend Codex
   n'est construit ; la classe de rôle historique `CodexPerception` reste réutilisable.
2. Une seconde inspection identique utilise le cache avec la même provenance ; une révocation
   refuse aussi ce cas sans appel au modèle. Une réponse livrée après révocation/annulation
   n'est ni conservée ni rendue comme preuve ; les baux restent détenus jusqu'à la fin réelle.
   Un changement d'identité ne réutilise pas l'ancien cache ; une observation admise d'une
   question précédente conserve l'identité de son réexamen d'origine.
3. Les bornes de 20 s, quatre passages, deux inspections et l'ancrage restent celles des
   vrais outils. Les paroles d'un passage entier ne deviennent pas une citation sur un extrait
   plus court ; une transcription échouée ne fournit aucune preuve de paroles.
4. Local, Codex explicite, smoke et `localInspection` sont distingués par les tests de
   composition. Backend invalide, configuration locale manquante, refus HTTP et JSON invalide
   ne provoquent aucun repli. Les priorités fichier/cache/environnement sont couvertes.
   Le dépassement de la limite locale de 45 s est consigné comme tel avec un temps maîtrisé.
5. Traces et métriques conservent l'identité réelle et les mesures T255, y compris échec,
   cache ou absence d'appel. Un champ backend fourni par le JSON modèle ne les remplace pas ;
   aucun jeton ni contenu média ne part dans ces diagnostics.
6. À l'implémentation future, jouer en séquentiel `local-inspection`, `session-providers`,
   `local-vlm-agent`, `revocable-inspector`, `reinspection-transcript-reuse`,
   `inspection-strategies`, `portable-config` et `review-regressions` sous `tests/` (`.test.cjs`), puis
   `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/local-inspection.test.cjs` sur le modèle du faux serveur de
`tests/local-vlm-agent.test.cjs`, avec médias temporaires et faux décodeur. Garder réels
le rôle d'inspection, la stratégie, le cache, la révocation et les outils ; contrôler Whisper.
Retenir la réponse du serveur jusqu'après abandon pour observer refus, bail et absence de cache tardif.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T255 est requis pour transmettre ses métriques sans les redéfinir. La réutilisation du modèle
de `config.localVlm` est un choix technique de cette tranche, pas une preuve de sa qualité sur
les planches. Le nombre d'images effectivement accepté et la qualité du modèle réel restent
à vérifier hors boucle. La voie actuelle sait envoyer les planches ; aucune compatibilité réelle
Ollama n'est déduite des seuls tests. T263 n'est pas nécessaire pour exercer le port d'inspection.

## Journal

- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T270.
