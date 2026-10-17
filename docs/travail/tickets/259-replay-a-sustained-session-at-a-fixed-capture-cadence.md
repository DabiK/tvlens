---
id: T259
titre: Drive a fixed-cadence capture and question schedule through the headless server
statut: a-faire
bloque_par: T257, T227
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une commande prépare G3 : captures et questions suivent un calendrier à origine fixe, sans
attendre le modèle. Chaque envoi et chaque question garde son issue, y compris en fin incomplète.
Cette première part de la tranche E d'Astra tient dans une session et un commit ; T261 livre le bilan.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, E, « Replay a sustained session at a fixed capture cadence »,
  base `beb9589` ; `docs/PRD-V2.md`, section 5, protocole G3 et surcharge séparée.
- Code relu à `16be86b` : `scripts/replay-lg-stream.cjs:109-112` compose vrai runtime et serveur ;
  `:165-182` alimente le flux. Sa vision est doublée (`:89-97`), son chat simulé (`:98-106`) et
  sa composition utilise `smoke: true` (`:110`) : ne pas reprendre cette configuration pour mesurer.
- `adapters/remote-media.cjs:20-42` valide les blocs HTTP ; `adapters/local-store.cjs:55` conserve
  les médias Mac avec leurs data URL, produits par `app/recording.js:71-76` ;
  `core/frame-policy.mjs:2` permet six images, contre cinq au maximum par bloc HTTP.
- `tv/transport.py:50-98` fixe la politique de livraison à reproduire. Le rejeu LG ne la couvre
  pas entièrement : `scripts/replay-lg-stream.cjs:180` abandonne sur 408 ou 5xx au lieu de réessayer.
- `server/ingest-routes.cjs:34` refuse une préparation concurrente ; `:41` attend assemblage et
  ingestion. `server/question-routes.cjs:4` expose la soumission, `:7-8` l'annulation des questions.
  `runtime/headless-runtime.cjs:237` publie les états ; `:415` soumet une question avec son ancrage.
- `server/ingest-routes.cjs:12-13` refuse un bloc trop futur ; `:22-33` déduplique par session,
  séquence et contenu. `core/session.cjs:153-156` refuse le retour à un intervalle antérieur :
  boucler un corpus demande de nouveaux temps et séquences, pas de renvoyer ses anciens blocs.
- `runtime/session-providers.cjs:148-161` choisit perception injectée, simulée ou réelle ;
  l'agent local est composé en `:158-159`. `adapters/local-vlm-agent.cjs:71` annonce le backend
  `ollama` ; `adapters/codex-session-run.cjs:130-138` ne fournit pas de champ backend équivalent.
- Coutures d'horloge existantes : `readClock` et `wallClock` (`runtime/session-runtime.cjs:68-69`,
  `runtime/headless-runtime.cjs:90`). T223 a retiré le balayage temporel (ADR 0055) ;
  T227 impose les contrats finaux de Mémoire et de coordination.
- `runtime/session-runtime.cjs:251-254` expose les refus de libération de fournisseurs,
  distincts du refus d'archive : une sauvegarde confirmée ne prouve pas une libération complète.
- Tests de raccord : `tests/server-ingest-path.test.cjs`, `tests/server-state-views.test.cjs`,
  `tests/question-ceiling.test.cjs`, `tests/capture-intake.test.cjs`. ADR 0023, 0028, 0046, 0050, 0051 et 0054.

## Périmètre

- À créer : `scripts/replay-local-stream.cjs` et `tests/local-stream-replay.test.cjs` ; réutiliser
  les identités d'entrées, empreintes et sorties de T257. Lire les interfaces après T224/T225/T227,
  sans dépendre des anciens noms de racine ou collections privées migrés par T220/T226.
- Composer vrai runtime headless, ingestion et questions par leurs frontières publiques, perception
  de production ; les fournisseurs et le temps restent injectables pour les tests. Doubler aussi
  transcription, chat, inspection, surveillance et embeddings : aucun rôle auxiliaire réel en test.
  Garder l'identité réelle de chaque rôle : les questions/inspections Codex rendent la charge hybride.
- Backend explicite, `local` ou `codex`, consigné. L'exécution `codex` fournit la référence G3,
  jamais présentée comme locale. Aide et validation ne construisent aucun agent ; les tests
  n'utilisent que le faux Ollama et un agent Codex doublé pour la perception.
- Ne pas reprendre `smoke: true`. Une exécution déclarée `local` sans `metrics.backend`
  identifiant Ollama est refusée comme mesure locale ; la référence `codex` explicite reste admise
  sans ce champ. Ne pas déduire une mesure locale de la seule option de lancement.
- Le scénario nomme un manifeste préparé par l'orchestrateur, compatible avec `/v1/segments` : 10 s au plus,
  une à cinq images en base64 sans préfixe, audio de 2 100 000 octets décodés au plus
  (`adapters/remote-media.cjs:20-42`). La validation refuse avant exécution tout bloc hors de
  ces bornes, dont un passage Mac à six images. La provenance des trente minutes (enregistrement
  fourni par le propriétaire, ou corpus T257 rejoué en boucle et déclaré comme tel) est un
  paramètre consigné dans le rapport. Les autres bornes du validateur produit restent applicables.
  Les exemples montrent la préparation depuis les médias T257 : retrait du préfixe d'encodage
  et sélection déclarée d'au plus cinq prises originales, sans modifier les sources ni inventer
  d'image. Le runner ne réduit pas silencieusement un bloc de six images.
- Définir dans le scénario les temps relatifs des blocs et images. À chaque occurrence d'un corpus
  bouclé, les translater sur l'horloge de la session et attribuer une nouvelle séquence croissante ;
  conserver cas source, occurrence et empreintes. L'envoi commence à la clôture prévue du bloc.
  Seuls les réessais gardent exactement séquence, horodatages et corps sérialisé de cette occurrence.
- Programmer les arrivées selon les échéances du scénario depuis une origine fixe, indépendamment
  des promesses d'upload, d'analyse et de réponse. Consigner échéance prévue, soumission effective
  et accusé/refus ; ne pas réduire la charge en attendant les réponses.
- Chaque envoi suit `tv/transport.py:50-98` : `/v1/session` puis `/v1/segments`, 5 s au plus
  par requête, budget de 30 s par bloc, nouvel essai après 1 s sur 408, 429, 5xx ou coupure,
  même séquence. Ce budget part de la disponibilité du bloc, sans remise à zéro au réessai.
  Conserver le bornage au budget restant, dont le plancher de requête de 100 ms
  et le dernier repos raccourci ; aucun nouvel essai après expiration. Conserver les refus terminaux
  de stockage, lecture seule ou session changée de ce transport, arrêter les envois futurs et les
  marquer non envoyés. Chaque tentative et son code sont consignés ; l'issue finale est « accepté »,
  « refusé (code) » ou « expiré ». Un arrêt garde explicitement les envois non terminés.
- Fournir un scénario nominal de trente minutes, questions réparties et rafale de trois, et un
  scénario de surcharge distinct. Les douze questions du PRD sont un plan exploratoire ; conserver
  un actif, cinq attentes et les refus existants, sans nouveau parallélisme de chat.
- Livrer aide et validation de scénario sans fournisseur ; exécution réelle sur option explicite,
  répertoire de données propre et sorties conservées. Une attente finale bornée appartient au runner,
  pas aux délais produit ; son dépassement marque la campagne incomplète.
- Limiter ce ticket au runner, au calendrier et aux issues d'envoi/question. Le journal des
  révisions, les publications audio/vision, les pertes, les échantillons de retard et le calcul
  de couverture sur toute la campagne sont livrés par T261, qui étend ce même runner.
- À ne pas toucher : politiques de files/recherche, plafonds, délais produit, rétention ou définition
  des pertes. `scripts/simulate-stream.cjs` garde son rôle virtuel ; le rejeu LG existant reste distinct.
- Aucun essai réel dans la session Codex : modèle local, TV, VPS et fournisseurs restent à
  l'orchestrateur ou au propriétaire. La télémétrie GPU et les trente minutes réelles sont collectées hors boucle.

## Critères d'acceptation

1. Avec horloge et fournisseurs maîtrisés, retenir une analyse n'arrête ni captures ni questions.
   Le test avance le calendrier sans rendre la réponse ; chaque envoi prévu devient accepté,
   refusé avec son code, expiré, ou explicitement non terminé après arrêt, sans disparition ni
   rattrapage silencieux. Les réessais suivent le transport TV : session puis bloc, même séquence,
   budgets de 5 s/30 s et attente de 1 s, bornés comme ci-dessus ; 408, 429, 5xx et coupures sont exercés.
   Les refus terminaux arrêtent les nouveaux envois et les rendent visibles comme non envoyés.
2. Le scénario nominal contient questions réparties et rafale ; le surplus au-delà de la capacité
   est exercé séparément et reçoit le refus produit. Les ancrages sont ceux des soumissions,
   sans futur ajouté pour compenser un retard. Aide et validation ne lancent aucun fournisseur.
3. La validation refuse avant exécution un intervalle hors bornes, une data URL, six images,
   un audio trop volumineux ou toute autre violation du contrat HTTP. Les exemples documentent
   enregistrement de trente minutes et corpus bouclé déclaré. La référence `codex` et la garde
   du backend d'une exécution `local` sont vérifiées avec des agents doublés.
   Deux occurrences du même cas sont acceptées avec des intervalles et séquences distincts ;
   un réessai de la même occurrence est reconnu comme doublon, avec un corps identique.
4. Un test retient le transport, annule une question puis livre une réponse tardive : celle-ci
   ne devient pas une réussite. Une fin en délai dépassé conserve journal et sorties précédentes
   avec statut « incomplet » et attentes restantes. Une fermeture de fournisseur refusée conserve
   son diagnostic, séparé de la confirmation d'archive.
5. Le rapport conserve SHA, empreintes, paramètres, rôles et backends réellement utilisés,
   issue de chaque envoi et de chaque question, intervalle total planifié et origine des horloges.
   Chaque tentative reste identifiable ; une campagne interrompue garde les sorties précédentes
   et ses attentes restantes. Les refus de fermeture/libération sont consignés séparément,
   même si une archive a été confirmée ; une libération non confirmée ne devient pas un succès.
6. À l'implémentation future, jouer en séquentiel `local-stream-replay`, `local-perception-replay`,
   `server-ingest-path` et `question-ceiling` sous `tests/` (`.test.cjs`), les contrats de
   projection/coordination affectés, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/local-stream-replay.test.cjs` avec scénario accéléré déterministe, vraie composition
headless/HTTP, fichiers temporaires et faux Ollama/chat/transcription. Conduire les échéances
avec horloge injectée et promesses retenues ; observer requêtes, réessais et fichiers produits.
Ajouter l'agent Codex doublé pour la référence. Le test prouve le calendrier et les issues,
jamais le débit matériel G3 ; T261 étendra ce fichier pour les mesures de campagne.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les dépendances directes minimales sont T257 et T227. T219 est terminé ; T224/T225, T220/T226
et la recette T233 sont couverts transitivement par T227. T232/T252 aident à lire les pertes
de quota sans bloquer ce runner ; un refus inconnu ne devient pas un quota. T240 n'est pas requis.

Décision du propriétaire du 17/10 : préparation avant la phase 2 retenue par T254, copie après T227,
répétition Mac avant accès et `hackathon-rc` en repli. Son corpus français réel est préparé au format
T257 avec grille T258 par l'orchestrateur. Seule une exécution réelle complète de trente minutes,
avec le bilan T261, hors session Codex, pourra établir G3. Un test accéléré laisse la stabilité
longue non testée ; un corpus bouclé mesure cette charge répétée, pas trente minutes de contenu inédit.

## Journal
