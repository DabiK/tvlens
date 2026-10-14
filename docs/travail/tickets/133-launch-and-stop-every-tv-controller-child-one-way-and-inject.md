---
id: T133
titre: Launch and stop every TV controller child one way and inject the layout root
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`tv/controller.py` lance ses enfants (capture, superviseur ambiant, reprise) par trois appels à
`subprocess.Popen` recopiés, et les arrête par deux copies du même arrêt (SIGTERM, attente de 12 s dans un fil,
puis SIGKILL sur le groupe). Les fichiers de disposition du panneau sont des chemins `/tmp` écrits en dur dans
le gestionnaire HTTP. Après ce ticket, le module a une seule fonction de lancement (`spawn`) et une seule
d'arrêt (`stop_child`), testées, y compris l'arrêt forcé d'un enfant qui ignore SIGTERM, que rien ne prouve
aujourd'hui. L'état et la demande de disposition passent par une classe `PanelLayout` dont la racine
s'injecte. Les routes, les codes de réponse, les messages et les fichiers écrits restent les mêmes.

## Sources

- Constats : PY-03
- Hors de ce ticket : l'horloge d'attente de `page_ack` et `page_wait` (`time.monotonic`, `time.sleep`).
- Code concerné, à la version `0d5a954` :
  - `tv/controller.py`, import facultatif d'`ambient` (l.18-19) : le contrôle de capture doit survivre à son
    absence.
  - `tv/controller.py`, `CaptureController.start` : `subprocess.Popen(self.command, stdin=…DEVNULL, stdout=…,
    stderr=…, start_new_session=True)` (l.54-55) ; `CaptureController.stop` (l.58-71) : `terminate`, fil
    `reap` avec `wait(timeout=12)`, puis `os.killpg(child.pid, signal.SIGKILL)` et `wait`.
  - `tv/controller.py`, `AmbientController.reconcile` : même lancement avec `env=self.environment()`
    (l.130-131) ; `AmbientController.start` (l.151-152) ; `AmbientController.stop` (l.155-168), copie de
    l'arrêt de la capture.
  - `tv/controller.py`, `DeviceServer.__init__(self, address, controller, token, ambient=None)` (l.267) ;
    `Handler.panel_state` (l.289-291) : lit `/tmp/tvlens-panel-layout-state.json`, défaut
    `{'active': False, 'mode': 'chat'}` ; `Handler.do_POST`, branche `/panel/chat` et `/panel/timeline`
    (l.324-335) : 409 « Ouvre le companion avec Rakuten. », fichier temporaire
    `/tmp/tvlens-panel-layout-request.<id>.tmp` remplacé sur `/tmp/tvlens-panel-layout-request.json`,
    500 « Impossible de changer la disposition. », temporaire supprimé dans `finally`.
  - `tests/test_tv_control.py` (9 tests) :
    - `test_boot_without_python_executable_uses_absolute_interpreter` (l.19) remplace
      `controller.subprocess.Popen` et lit `launch.call_args.args[0][0]` : la commande reste le premier
      argument positionnel de `Popen` ;
    - `test_concurrent_layout_requests_publish_complete_authenticated_messages` (l.34) remplace
      `controller.Path` par `lambda value: root / Path(value).name` pendant les requêtes seulement, après la
      construction de `DeviceServer`.
  - `tests/test_tv_ambient.py` : lit `control.child.pid`, `control.recovering.wait(timeout=10)` (l.780) et
    `self.capture.child` ; assertions de source sans `GateWriter` ni `luna` dans `controller.py` (l.785-786) ;
    `DeviceServer(..., self.control)` (l.956) et `DeviceServer` à trois arguments (l.1074).
  - Lecteurs des mêmes fichiers, hors périmètre : `tv/ambient.py`, `AmbientPaths` (l.120-132) ;
    `prototypes/lg-remote/runtime/panel.py`, `LAYOUT_REQUEST` et `LAYOUT_STATE` (l.8-9). Un nom commun à
    ces chemins n'est pas dans ce ticket.

## Périmètre

- À modifier : `tv/controller.py`.
  - `spawn(command, env=None)`, au niveau du module : appelle `subprocess.Popen` avec la commande en premier
    argument positionnel, les trois flux sur `DEVNULL`, `start_new_session=True`, et `env` seulement s'il est
    donné. `CaptureController.start`, `AmbientController.reconcile` et `AmbientController.start` l'utilisent ;
    les attributs `child` et `recovering` restent les objets `Popen` rendus.
  - `stop_child(child, grace=12)`, au niveau du module : `terminate`, puis dans un fil démon l'attente de
    `grace` secondes et, à son expiration, `os.killpg(child.pid, signal.SIGKILL)` (sans erreur si le groupe a
    disparu) puis `wait`. `CaptureController.stop` et `AmbientController.stop` l'utilisent ; leurs conditions
    (`active`, `stopping`) et leur verrou ne changent pas.
  - `PanelLayout(root='/tmp')` : `state()` et `request(mode)` reprennent la lecture et l'écriture atomique
    actuelles. Les chemins sont construits à chaque appel par `Path(<chemin complet>)`, pour que le
    remplacement de `controller.Path` du test existant continue de détourner les fichiers. `request` rend la
    demande `{id, mode}` ou laisse passer `OSError` ; `PanelLayout` ne dépend pas du module `ambient`.
  - `DeviceServer` reçoit `layout=None` en dernier paramètre nommé, `PanelLayout()` par défaut ; les appels
    existants restent valides. Le gestionnaire garde les codes 409, 500 et 200 et les textes affichés.
- À modifier : `tests/test_tv_control.py`, par ajout de tests seulement.
- À ne pas toucher : `tv/ambient.py`, `tv/capture.py`, `prototypes/`, `page_ack`, `page_wait`, les routes du
  contrôleur, `tests/test_tv_ambient.py`.
- Aucun `except` qui avale une erreur ajouté (hors `ProcessLookupError` de `killpg`, comme aujourd'hui) ; aucune
  ligne de plus de 160 caractères ajoutée.

## Critères d'acceptation

1. Nouveaux tests dans `tests/test_tv_control.py` :
   - `stop_child` sur un enfant lancé par le test avec `start_new_session=True`, qui ignore SIGTERM et écrit
     une ligne sur sa sortie une fois son gestionnaire posé (le test lit cette ligne avant d'arrêter), avec une
     grâce de 0,2 s : l'enfant se termine en moins de 5 s avec le code de retour `-signal.SIGKILL` ;
   - `stop_child` sur un enfant qui accepte SIGTERM : code de retour `-signal.SIGTERM` ;
   - `spawn` avec `controller.subprocess.Popen` remplacé : premier argument positionnel égal à la commande,
     `stdin`, `stdout` et `stderr` à `subprocess.DEVNULL`, `start_new_session=True`, et `env` présent si et
     seulement s'il est donné ;
   - `PanelLayout` sur une racine temporaire : `state()` rend `{'active': False, 'mode': 'chat'}` sans fichier
     ou avec un fichier illisible, et le contenu du fichier sinon ; `request('timeline')` publie
     `tvlens-panel-layout-request.json` égal à la demande rendue et ne laisse aucun `*.tmp` ;
   - `/panel/chat` sur un `DeviceServer` construit avec `layout=PanelLayout(<racine temporaire>)` dont l'état
     est inactif : 409 et `{'error': 'Ouvre le companion avec Rakuten.'}`, sans remplacer `controller.Path` ;
   - le même `PanelLayout` fonctionne avec `patch('controller.ambient', None)`.
2. Faute injectée puis défaite : `stop_child` sans le repli `killpg` fait échouer le test de l'enfant qui ignore
   SIGTERM, sortie au journal ; la faute est défaite et le test relancé passe.
3. `grep -c "subprocess.Popen" tv/controller.py` rend 1 ; `grep -c "killpg" tv/controller.py` rend 1 ;
   `grep -c "/tmp/tvlens-panel-layout" tv/controller.py` rend 0 (respectivement 3, 2 et 3 à `0d5a954`).
4. `grep -c "def test" tests/test_tv_control.py` passe de 9 à au moins 14 ; aucun test existant n'est modifié,
   et aucun nouveau test n'écrit dans le vrai `/tmp` (racines par `tempfile.TemporaryDirectory`).
5. `python3 -B -m unittest discover -s tests -p "test_tv_*.py"` passe, sortie au journal (dont les assertions de
   source de `tests/test_tv_ambient.py` sur `controller.py`).
6. `node scripts/check.mjs` est vert (le mode complet lance les tests Python).

## Test d'acceptation attendu

Dans `tests/test_tv_control.py`, à la frontière des fonctions `spawn` et `stop_child` et de la classe
`PanelLayout` importées de `controller`, plus une requête HTTP réelle sur `127.0.0.1`, port 0, comme les tests
existants du fichier.

## Hypothèses bloquantes

Aucune décision n'est attendue. Ce ticket ne dépend pas de `jalon:format` : la mise en forme du lot L03 ne
touche pas les fichiers Python. Si un test existant ne passe plus qu'en modifiant une de ses assertions ou un
de ses remplacements (`controller.Path`, `controller.subprocess.Popen`) : verdict BLOQUÉ, avec le test et
l'écart constaté.

## Journal
