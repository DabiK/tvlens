# 0018 — Un contrôleur injecté possède les ressources de capture du Mac

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/167-move-mac-preview-and-recording-into-an-injected-capture-controller.md`
- Statut : acceptée

## Contexte

`app/renderer.js` détenait le flux d'écran, le contexte audio, le worklet, le recorder et les attentes
de flush. Leur orchestration était liée au chargement de la page. Le recorder lui-même est déjà
importable et possède ses rotations, checkpoints et ingestions. L'extraction doit permettre de
tester l'orchestration sans démarrer Electron ni acquérir les ressources natives du Mac.

## Décision

`app/ui/capture-controller.mjs` expose `createCaptureController`. La composition lui remet le bridge
hôte, la sélection et la lecture de source, les fabriques navigateur, la fabrique de recorder, les
minuteries, les UUID, l'élément vidéo, la lecture de session et les callbacks de présentation.
Le module ne lit aucune dépendance de page ou de navigateur à son chargement.

Le contrôleur possède le flux, le contexte audio, le worklet, le recorder et les flushes. Ses commandes
`startPreview`, `openCapture`, `observe`, `flushAudio` et `stop` orchestrent ces dépendances. Les
lectures `previewOpen`, `recording` et `stopping` alimentent les contrôles de la page. Les callbacks
rapportent statut, état, erreurs, niveau audio, aperçus de passages et changements de présentation.

Les demandes d'arrêt simultanées partagent une promesse. L'arrêt attend le recorder et ses ingestions,
puis l'hôte, avant d'arrêter les pistes et de fermer l'audio. La fin de piste utilise cette même
commande. L'enchaînement s'interrompt sur un refus, comme avant l'extraction : si le recorder refuse,
il reste détenu avec le flux et l'audio et l'hôte n'est pas arrêté ; si l'hôte refuse, le recorder déjà
arrêté est retiré mais le flux et l'audio restent disponibles. La promesse transmet l'erreur au
demandeur. Le statut reste inchangé, sans annonce de pause. Seul un arrêt abouti annonce
« Capture en pause · Contexte et chat conservés » avec une session chargée, ou « Capture inactive »
sans session.

La présentation réapplique l'état de l'aperçu après un refus d'arrêt, ce qui remet `disabled` à
`false` sur le bouton Arrêter si le flux est conservé. Cette réactivation est nouvelle : l'ancien
renderer laissait ce bouton désactivé après les deux refus. Elle rend Arrêter utilisable seulement
après un refus du recorder, qui est encore détenu. Après un refus de l'hôte, le recorder est déjà
retiré et `ViewingShell.observation` masque Arrêter. Une nouvelle tentative peut alors passer par
le contrôleur, la fin de piste ou le changement de source de la fenêtre flottante ; le bouton
Arrêter masqué ne permet pas cette action.

Les erreurs d'acquisition ou de branchement audio libèrent les ressources acquises avant d'être
présentées, même si l'hôte refuse son arrêt : un aperçu défaillant n'est pas conservé pour une reprise.
Le refus d'arrêt et l'erreur d'aperçu sont alors rapportés par leurs callbacks respectifs. Chaque flush
a son UUID et sa minuterie injectés ; acquittement, délai ou libération retirent l'attente et son timer.
La libération résout immédiatement les flushes en attente, sans attendre le délai de 500 ms que
l'ancien renderer laissait finir. Le mode `quiet` conserve la suppression du dernier refus de passage
lors d'une pause décidée par l'hôte.

La reprise d'une archive reste explicite : `resumeSession`, lecture de l'état, session reprise si elle
accepte, sinon repli `start`. L'enregistrement direct passe par `start`. Les règles du recorder et le
protocole IPC restent ceux des modules existants, avec leurs garanties de publication et de durabilité.

La migration se fait en deux temps. Cette extraction compose une seule instance dans le renderer et
conserve ses petites délégations. Les commandes flottantes et les archives lisent ses statuts. Les
checkpoints accèdent encore au recorder et le déchargement aux pistes par deux accesseurs provisoires,
sans copie d'état ni seconde instance. T168 doit migrer ces derniers accès et les commandes restantes,
puis fermer l'accès aux ressources : le contrôleur sera leur seul propriétaire et seul point de libération.

## Alternatives écartées

- Charger le renderer en réécrivant ses imports : couplerait la preuve au texte de la composition.
- Modifier `RollingRecorder` ou le preload pendant l'extraction : leurs contrats sont déjà testés et
  ne relèvent pas de l'orchestration extraite.
- Migrer immédiatement toutes les commandes et supprimer les accesseurs : élargirait cette première
  étape à la migration réservée à T168.

## Conséquences

L'orchestration se teste par ses commandes publiques avec un navigateur et un bridge contrôlés.
La composition conserve les messages et les éléments DOM ; le contrôleur ne connaît aucun ID de page.
L'interface provisoire expose encore deux ressources : elle devra être resserrée après la migration
des derniers appelants. Les tests sous doublures ne prouvent pas le fonctionnement matériel du Mac.

## Protégée par

- `tests/capture-controller.test.cjs` : acquisition, audio, reprise, flush (y compris à la libération),
  refus d'arrêt et leur nouvelle tentative, état du bouton Arrêter avec le vrai shell, arrêt différé
  et messages avec ou sans session.
- `tests/recording.test.cjs` : les six comportements du vrai recorder, sans changement d'assertions.
- `tests/mac-ui.test.cjs` : composition unique, délégations, contrôles, imports, IDs et bridge.
- `tests/mac-ipc-contract.test.cjs` : contrat du bridge et du véritable hôte Mac sous doublure Electron.
- Une mutation temporaire plaçant l'arrêt de l'hôte avant celui du recorder rend rouge le test d'arrêt
  simultané ; sa sortie et la restauration sont consignées dans le journal du ticket.
