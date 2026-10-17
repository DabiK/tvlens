---
id: T261
titre: Report revisions, lane losses and whole-run coverage of a sustained replay
statut: a-faire
bloque_par: T259
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le rejeu soutenu produit un bilan de toute la campagne : révisions observées, publications audio
et vision, pertes par voie, couverture et retard. Un dernier passage prêt ne masque jamais
une lacune antérieure. Cette seconde part de la tranche E d'Astra tient dans une session et un commit.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, E, à `beb9589`, puis coupe de la relecture du 17/10 : le calendrier d'envoi et les
  issues appartiennent à T259 ; ce ticket ajoute les mesures de G3 sur toute l'exécution.
- Code relu à `16be86b` : `core/memory/memory-view.cjs:58` expose des métadonnées détachées,
  dont horodatages et métriques ; `:74` calcule la couverture et `:101` expose les trous.
  `:10` fixe le seuil de trou de capture à 250 ms. T219 est terminé et fournit les données
  temporelles qui manquaient au rapport Astra.
- `core/memory/memory-view.cjs:16-23` ne cherche les trous que jusqu'au dernier passage reçu,
  et `:71-87` calcule le retard depuis le dernier passage prêt, sans garantir la continuité.
  `core/memory/coverage.cjs:7-16` fournit intervalles en défaut et compteurs, pas un pourcentage
  de trente minutes. Le scénario doit fournir la fenêtre planifiée pour mesurer aussi la fin manquante.
  Depuis T223 (ADR 0055), aucun balayage ni transfert temporel en `history` n'existe ; les pertes
  de voie restent mesurables par erreur, retenue ou surcharge, sans recréer d'expiration.
- `runtime/headless-runtime.cjs:424` lit `session.memory.view()` en processus pour la session
  chargée. `runtime/memory/memory-projection.cjs:22-36` ne publie pas ses trous à 250 ms.
  `runtime/state-views.cjs:97-105` calcule le `captureGaps` HTTP à 1 000 ms, valeur de
  `core/memory/topic-continuity.cjs:1`, publiée par `runtime/headless-runtime.cjs:294`.
- `scripts/replay-lg-stream.cjs:121` suit les publications par identifiant : les versions sont
  écrasées. `core/latency-trace.cjs:12` ne résume que quarante passages ;
  `runtime/state-views.cjs:8-15` borne aussi les vues légères. Aucune n'est un bilan complet.
- `runtime/headless-runtime.cjs:237` publie les révisions d'état ; le canal à retenir doit être
  relu après T225. ADR 0046, 0050, 0051 et 0054 : consultation, révisions, pertes et projection.
  `runtime/session-runtime.cjs:165-173` fournit les lectures publiques et `:227-233` expose
  les événements et la consultation de la même session. Une révision d'hôte n'est pas une révision de passage.
  Tests existants : `tests/memory-view.test.cjs`, `tests/session-events.test.cjs`,
  `tests/memory-projection.test.cjs`, `tests/server-state-views.test.cjs`.
- T259 livre `scripts/replay-local-stream.cjs` et `tests/local-stream-replay.test.cjs` : scénario,
  validation sans agent, calendrier à origine fixe, réessais TV, questions et fin bornée.
  Les noms et interfaces définitifs de Mémoire sont ceux livrés après T227, prérequis transitif.

## Périmètre

- À modifier : `scripts/replay-local-stream.cjs`, ses aides de rapport sous `scripts/` si besoin,
  et `tests/local-stream-replay.test.cjs`. Réutiliser SHA, empreintes, paramètres, rôles/backends
  et issues d'envoi/question déjà acquis par T259 ; ne pas créer un second calendrier.
- Tenir un journal progressif par session/passage/révision, avec publications audio et vision,
  pertes par voie, issues de questions et échantillons de retard sur toute l'exécution.
  Conserver les versions observées au lieu d'écraser un passage par sa dernière valeur.
- Lire intervalles, trous et pertes en processus, dans la vue de la session chargée (aujourd'hui
  `session.memory.view()`, `runtime/headless-runtime.cjs:424`), avant la fin de session.
  Consigner à part le `captureGaps` de `/v1/state`, calculé à 1 000 ms. Nommer le canal des
  révisions (abonné en processus après T225, ou sondage de `/v1/state` marqué échantillonné).
  Un canal échantillonné ne prétend pas avoir observé toutes les publications intermédiaires.
  L'abonné de passage utilise la lecture bornée par identifiant pour conserver sa version ;
  ne pas reconstruire un état complet à chaque événement, conformément à la contraction T225.
- Calculer le bilan sur tous les intervalles et pertes de la campagne, y compris les publications
  antérieures aux quarante derniers passages. Distinguer capture, preuves audio et preuves vision ;
  un refus d'ingestion ne devient pas une perte de voie d'un passage qui n'existe pas.
  Rapporter l'union des intervalles reçus à la fenêtre planifiée du scénario, même si ses premiers
  ou derniers envois manquent. Dédupliquer les réessais par passage et les pertes par voie/révision ;
  ne pas additionner les compteurs cumulatifs à chaque échantillon. Conserver à part les trous
  publiés par le produit. Un audio `failed` n'est pas un silence réussi et une voie prête ne
  prouve pas la vérité de son texte.
- Échantillonner selon un pas consigné, même sans nouvelle publication : horloge de session,
  bornes de capture/analyse, retard publié, dernières preuves audio/vision disponibles et leur âge.
  L'absence de preuve reste inconnue. Distinguer ce retard de l'absence de couverture continue ;
  nommer les domaines d'horloge avant toute soustraction, selon l'ADR 0028.
- Séparer temps soumission → réponse observable par le client HTTP et décomposition interne
  disponible. Garder les métriques T255 et les temps bruts acquis ; toute étape non observable,
  dont attente effective de l'agent ou premier token, reste inconnue. Un délai n'est pas remplacé
  par zéro et le résidu client moins fournisseur ne devient pas une mesure pure du réseau.
- Une réponse livrée après annulation ou fermeture ne devient ni réussite ni preuve acquise.
  Conserver journaux et bilan partiel si l'attente finale de T259 expire ; afficher « incomplet »,
  attentes restantes, limites d'observation et mesures indisponibles.
- À ne pas toucher : cadence, réessais et validation livrés par T259, politiques de files/recherche,
  plafonds, délais produit, rétention, définition des pertes, format d'archive ou divergence
  d'affichage des clients. Aucun nouvel ADR : les contrats de consultation existants restent ceux du produit.
- Aucun essai réel dans la session Codex, modèle local compris. Faux Ollama, agent Codex doublé,
  chat/transcription et temps maîtrisés pour les tests ; trente minutes réelles et télémétrie GPU
  restent à l'orchestrateur ou au propriétaire, hors boucle.

## Critères d'acceptation

1. Un passage publié avec audio seul puis avec vision garde ses révisions observées et les
   métriques T255. Le journal nomme son canal et distingue observation exhaustive et échantillonnée ;
   aucune publication intermédiaire non observée n'est inventée.
2. Avec plus de quarante passages, un trou antérieur et une perte de voie restent dans le bilan
   après un dernier passage prêt. Totaux et dénominateurs couvrent toute la campagne, calculés
   sur les intervalles et pertes ; capture, audio et vision restent distingués sans double comptage.
   Un dernier envoi absent réduit la couverture de la fenêtre planifiée ; une livraison reconnue
   comme doublon et un compteur relu deux fois ne l'augmentent pas. Un audio `failed` reste un échec.
3. Un écart de 400 ms apparaît dans les trous de consultation à 250 ms et reste distinct du
   `captureGaps` HTTP à 1 000 ms. Le bilan lit la vue en processus avant fermeture et garde les
   deux sources identifiées ; il ne prétend pas obtenir cette consultation par HTTP.
4. Un test retient le transport, annule une question, livre une réponse tardive et provoque une
   perte de voie : aucune réponse tardive ne compte comme preuve acquise ou réussite. La perte
   est conservée par voie ; une fin en délai dépassé garde le bilan partiel et le statut « incomplet ».
5. Le rapport contient des échantillons de retard sur toute l'exécution, couverture/pertes et
   limites observables. Il sépare soumission → réponse HTTP et décomposition interne disponible ;
   attente effective d'agent, premier token ou autre étape non observée sont « inconnus ».
   Pendant un fournisseur retenu sans publication, le calendrier produit encore des échantillons
   et l'âge de la dernière preuve disponible augmente ; une preuve absente ne prend pas l'âge zéro.
   La référence Codex reste identifiée et aucun fallback ne devient une mesure locale.
6. À l'implémentation future, jouer en séquentiel `local-stream-replay`, `memory-view`,
   `session-events`, `memory-projection` et `server-state-views` sous `tests/` (`.test.cjs`),
   les contrats de projection/coordination affectés, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Étendre `tests/local-stream-replay.test.cjs` par la frontière publique du runner de T259, avec
vraie composition headless/HTTP, fichiers temporaires, fournisseurs doublés et horloge injectée.
Publier séparément audio et vision, accumuler plus de quarante passages, introduire trou et perte
par erreur ou surcharge, jamais par balayage temporel,
puis terminer par un passage prêt. Observer journal exporté et bilan, retenir une réponse jusqu'après
annulation et conduire une fin incomplète. Le test prouve les calculs et la conservation des faits,
jamais la qualité, le GPU ou le débit matériel G3.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T259 est le seul prérequis direct ; il apporte T257/T255 et la contraction Mémoire T227.
L'implémentation relit les interfaces livrées après T225/T227 sans utiliser les collections privées.
T232/T252 aident à identifier et afficher les quotas sans bloquer ce bilan ; un refus inconnu
ne devient pas un quota. T240 n'est pas requis : avant lui, l'attente réelle de l'agent peut rester
incluse dans le traitement annoncé. Cette limite doit figurer dans le rapport.

Décision du 17/10 : copie après T227 et intégration des préparatifs, répétition Mac avant accès,
`hackathon-rc` en repli, phase 2 retenue par T254. Le propriétaire fournit les extraits français ;
l'orchestrateur prépare manifeste et grille. La source des trente minutes est consignée par T259 :
enregistrement fourni ou corpus bouclé déclaré. Un test accéléré ne constitue pas G3 ; une campagne
réelle complète n'établit la stabilité que pour son SHA, ses entrées et ses paramètres.

## Journal
