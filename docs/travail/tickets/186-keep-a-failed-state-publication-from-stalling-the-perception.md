---
id: T186
titre: Keep a failed state publication from stalling the perception lanes and the question queue
statut: a-faire
bloque_par: T199
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une exception d'un observateur ne bloque ni la perception ni la file des questions. Le dernier état
reste consultable, les sauvegardes et le travail suivant sont tentés, et l'échec de publication reçoit
un diagnostic distinct d'une erreur du fournisseur.

## Sources

- `docs/audit-architecture.md`, rapport B, B1 et D1 ; synthèse de l'orchestrateur, publication.
  Décision du propriétaire, le 16/10 : fiabiliser ces transitions dans la première vague.
- Code vérifié à `8340014` : `core/session.cjs:280` lève les drapeaux audio, puis publie à
  `core/session.cjs:282`, avant le `try`. Même disposition pour la vision à
  `core/session.cjs:322` et `core/session.cjs:324`. Les publications des fins de voies précèdent
  encore drainage et persistance à `core/session.cjs:305` et `core/session.cjs:373`.
- `core/session.cjs:506` appelle directement l'observateur. `runtime/session-runtime.cjs:176`
  chaîne index, manifeste et hôte. `runtime/headless-runtime.cjs:246` appelle chaque abonné sans
  isolation : le refus du premier peut empêcher les suivants de recevoir l'état.
- `core/deep-ask.cjs:73` publie avant le drainage ; `core/deep-ask.cjs:78` publie le travail actif
  avant `run`. Les publications finales à `core/deep-ask.cjs:155` et `core/deep-ask.cjs:167`
  précèdent aussi des étapes nécessaires. `runtime/conversation-runtime.cjs:59` compose ce cœur
  pour les deux hôtes ; `app/main.cjs:147` et `runtime/headless-runtime.cjs:120` sont ses observateurs.
- Tests lus : `tests/split-perception.test.cjs`, `tests/session-latency.test.cjs`,
  `tests/deep-ask-restore.test.cjs`, `tests/video-research.test.cjs`, `tests/chat-trace.test.cjs`
  et `tests/watch-session-ending.test.cjs`. Attention : `tests/session-latency.test.cjs:228`
  exige actuellement que le refus de l'observateur fasse rejeter `prune()`.
- ADR 0003 : publication avant sauvegarde ; ADR 0004 : libération après le retour effectif de
  l'agent ; ADR 0019/0020 : composition et cycle de vie du runtime.

## Périmètre

- Dans `core/session.cjs` et `core/deep-ask.cjs`, rendre les notifications incapables d'interrompre
  une transition. Couvrir toutes leurs émissions, y compris progression, annulation, fin, pause,
  reprise et publication de l'issue d'une sauvegarde ; ne pas corriger seulement les deux lignes
  avant les `try`. Les erreurs métier et de stockage conservent leur traitement propre.
- Injecter un diagnostic de publication dans ces cœurs, sans import externe ni accès à la machine.
  Le câbler dans `runtime/session-runtime.cjs`, `runtime/conversation-runtime.cjs` et les deux
  hôtes. Le diagnostic est observable hors d'une option de trace Codex ; un diagnostic qui lève
  ne relance pas l'erreur dans le métier et ne provoque pas de nouvelle émission récursive.
- Isoler les abonnés de `HeadlessRuntime.emit()` : un abonné défaillant n'empêche pas les autres
  de recevoir la publication. Garder révision et état courant consultables après le refus.
- Ajouter les scénarios dans les tests des modules et de la composition. Modifier l'attente de
  rejet de `prune()` citée ci-dessus en preuve de continuation avec diagnostic ; déclarer ce
  changement de contrat dans `ecarts.md`, sans retirer les assertions sur la rétention et l'ingestion.
- Écrire un ADR court sur la séparation entre transition, notification et diagnostic, en conservant
  les garanties des ADR 0003 et 0004. La reprise des notifications de surveillance relève de T187.
- Ne changer ni ordonnancement des voies, ni pertes, délais, reprises fournisseur, sélection des
  preuves, formats d'archive ou ordre de fermeture. Ne déplacer aucun composant du harnais.

## Critères d'acceptation

1. Par `WatchSession.ingest()` avec perception à deux voies, un observateur qui lève à chaque
   publication laisse deux passages successifs finir leurs transcriptions et descriptions, une fois
   chacune. Les drapeaux reviennent au repos et les files se vident ; les sauvegardes sont tentées.
2. Des cas ciblent séparément publication de départ audio, transcript, départ vision, progression
   et fin vision, puis un refus réel du fournisseur. L'exception d'observation n'est pas comptée
   comme erreur audio/vision et ne remplace pas la raison réelle d'un refus du fournisseur.
3. Par `DeepAsk.start()`, deux questions conduites par promesses différées finissent malgré un
   observateur qui lève sur queued, running, progression et états finaux. `done` se règle, `active`
   est libéré, la suivante démarre et les minuteries disparaissent. Annulation et plafond conservent
   leurs résultats ; un agent tardif garde ses outils jusqu'à son retour effectif, puis les rend.
4. Chaque refus de publication tenté produit un diagnostic identifiable par origine et session ou
   travail. Faire lever ce diagnostic laisse les critères 1 et 3 vrais, sans boucle de publication.
   L'état acquis reste lisible par `snapshot()` même si aucune notification n'a été livrée.
5. Deux abonnés du serveur, dont le premier lève : le second reçoit l'état et la révision avance.
   Les compositions Mac et serveur câblent le diagnostic, vérifié par injection aux coutures des
   bancs existants, sans Electron natif ni fournisseur réel.
6. Les tests cités passent en séquentiel, avec l'unique évolution d'attente de `prune()` explicitée.
   `node scripts/check.mjs` est vert à l'implémentation, sans suppression de test ni hausse du gel.

## Test d'acceptation attendu

Étendre `tests/split-perception.test.cjs` et `tests/deep-ask-restore.test.cjs` par les frontières
`ingest`, `start`, `cancel` et `snapshot`, avec observateurs défaillants, fournisseurs maîtrisés et
promesses différées. Utiliser les horloges et attentes partagées pour le plafond et les fins de
travaux. Les assertions portent sur résultats, diagnostics, files, sauvegardes et libérations ;
elles ne lisent pas le texte des fonctions. Compléter les bancs de composition pour les abonnés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les blocages sont déduits du contrôle de flux à `8340014`, sans reproduction exécutée lors du
découpage. T199 implique T178. Ce ticket n'affirme ni livraison réussie d'une notification refusée,
ni réparation d'un observateur ; il garantit la transition et le diagnostic de son échec.

## Journal
