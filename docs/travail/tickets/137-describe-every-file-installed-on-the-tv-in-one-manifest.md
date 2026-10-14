---
id: T137
titre: Describe every file installed on the TV in one manifest checked against the code
statut: a-faire
bloque_par: T100, T101, T103, T106
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Ce qu'il faut copier sur la TV n'est écrit en entier nulle part. La table de `docs/lg-installation.md`
oublie deux modules que le compagnon importe (`ambient.py` et `luna.py`), ainsi que le service Tailscale.
Rien ne dit non plus ce qu'une installation ne doit jamais écraser.

Après ce ticket, `tv/manifest.json` décrit, pour chaque composant installé, ses fichiers source, leur
destination sur la TV et ses points d'entrée. Il décrit aussi les crochets de démarrage, les applis par
identifiant, et ce qui est préservé. Un test Python vérifie que le manifeste suffit au code : tout module
importé depuis un point d'entrée y figure, et chaque chemin cité par un crochet en est une destination. La
table de la documentation est corrigée, et le même test la tient d'accord avec le manifeste.

Rien n'est copié sur la TV. Le futur `deploy-tv` lira ce manifeste (fiche, § 3, étape 7).

## Sources

- Constats : OPS-16
- Fiche du lot : `docs/travail/fiches/livraison.md`, § 1.2, § 2 (ligne `tv/manifest.json`), § 3, étape 4,
  et § 4 (fichiers préservés, replis `except Exception` conservés).
- Code vérifié à la version `0d5a954`. Le lot L09 déplace `prototypes/lg-remote/` vers `tv/remote/` sans
  changer le contenu des fichiers : les chemins se lisent tels qu'ils sont au moment du traitement.
- Compagnon, installé dans `/media/developer/tvlens-companion/` :
  - `tv/controller.py` :
    - `try: import ambient` / `except Exception: ambient = None` (l.18-19) ;
    - lance `capture.py`, voisin de son fichier (l.26) ;
    - lance `ambient.py`, voisin de son fichier (l.94) ;
    - lit `ambient.json` et `ambient-settings.json` dans son dossier (l.91-92). `docs/lg-ambient.md:32`
      les décrit comme les choix privés du spectateur, à côté de `connection.json` : à préserver, jamais à
      copier.
  - `tv/capture.py` : `from transport import …` (l.3), et import de `ambient` avec repli (l.7-8).
  - `tv/ambient.py:24` : `import luna as luna_module`.
  - `tv/luna.py` et `tv/transport.py` n'importent que la bibliothèque standard.
- Relais de touches, installé dans `/media/developer/tvlens-remote/` avec la même arborescence :
  - `prototypes/lg-remote/control.py` : `ENTRY=…'runtime/tvlens_mapper.py'` (l.6), lancé avec
    `rakuten.json` (l.31).
  - `runtime/tvlens_mapper.py` :
    - `import managed_mapper` (l.3) ;
    - `AMBIENT_CONFIG = '/media/developer/tvlens-companion/ambient.json'` (l.5) : le relais lit un fichier
      préservé du compagnon, chemin qui traverse les deux composants ;
    - lance `panel.py`, voisin de son fichier (l.9) ;
    - `from ambient_relay import Relay` dans une fonction (l.25).
  - `runtime/managed_mapper.py` :
    - ajoute `vendor/` au chemin d'import (l.12-18) ;
    - `import magic_mapper` (l.19) et `from magic_mapper_runtime import` (l.20) ;
    - lit `vendor/upstream.json` (l.29).
  - `runtime/magic_mapper_runtime.py:13` lit `action_catalog.json`.
  - `runtime/ambient_relay.py:21` : `from panel import parse_reply`.
  - `vendor/magic_mapper.py:11` : `import socket`, dans un bloc.
  - Fichiers suivis : `control.py`, `rakuten.json`, `runtime/` (`action_catalog.json`, `ambient_relay.py`,
    `magic_mapper_runtime.py`, `managed_mapper.py`, `panel.py`, `tvlens_mapper.py`) et `vendor/`
    (`magic_mapper.py`, `upstream.json`). `README.md`, `LICENSE.upstream`, `.gitignore` et les tests ne
    sont pas installés.
- Crochets :
  - `prototypes/lg-remote/30-tvlens-remote` lance `/media/developer/tvlens-remote/control.py boot`, vers
    `/var/lib/webosbrew/init.d/30-tvlens-remote` ;
  - `tv/35-tvlens-capture-control` lance `/media/developer/tvlens-companion/controller.py --config
    /media/developer/tvlens-companion/connection.json`, vers
    `/var/lib/webosbrew/init.d/35-tvlens-capture-control`.
- Tailscale :
  - `tv/tailscale-service.sh` : `BASE=/media/developer/tvlens-tailscale` (l.6), avec `state/` et `bin/` ;
  - `docs/lg-tailscale.md:50` : il est installé sous le nom `service`, appelé par le crochet privé
    `/var/lib/webosbrew/init.d/25-tvlens-tailscale`, absent du dépôt.
- Applis enregistrées :
  - `org.tvlens.sidebarprobe`, depuis `tv/app/` (`docs/lg-installation.md:19`). `tv/app/connection.js`
    est privé, ignoré par Git ;
  - `org.tvlens.ambient` (`docs/lg-ambient.md:12` et `:35`).
  - Après lot:L09, les deux paquets se construisent par `npm run package:tv`.
- `docs/lg-installation.md`, section « 2. Installer les composants TV », table l.16-22 : sans
  `tv/ambient.py`, `tv/luna.py`, le service Tailscale, ni l'affichage ambiant.

## Périmètre

- À créer :
  - `tv/manifest.json`. Le format exact est au choix de la session ; il porte au moins :
    - par composant (`companion`, `remote`, `tailscale`) : son dossier de destination ; la liste de ses
      fichiers (chemin source dans le dépôt, chemin relatif à la destination, par exemple
      `tv/tailscale-service.sh` vers `service`) ; ses points d'entrée Python (ceux lancés par un crochet ou
      en sous-processus, cités ci-dessus) ; ses dossiers d'import supplémentaires (`vendor/` pour le
      relais) ; ce qu'il préserve (`connection.json`, `ambient.json` et `ambient-settings.json` du
      compagnon, `state/` et `bin/` de Tailscale) ;
    - les crochets du dépôt, chacun avec sa source et sa destination, et le crochet
      `25-tvlens-tailscale`, déclaré préservé ;
    - les applis, par identifiant, avec leur dossier source et leurs fichiers privés (`connection.js` du
      panneau). Le contenu des paquets reste à la liste fermée de lot:L09, sans copie ici.
    - Ni mode, ni propriétaire, ni chemin physique des applis : ce sont des relevés du propriétaire sur la
      TV (fiche, § 7, décision 8).
  - `tests/test_tv_manifest.py`, `unittest`, bibliothèque standard seulement. Il ne lance aucun code de la
    TV.
  - Une ADR, `docs/adr/NNNN-…md`, au prochain numéro libre, sur le gabarit `0000`. Elle dit :
    - le manifeste est la seule description de ce qui s'installe sur la TV ;
    - la documentation et le futur `deploy-tv` en dérivent ;
    - les fichiers préservés n'y figurent jamais comme fichiers à copier.
- À modifier : `docs/lg-installation.md`, la table de la section 2. Elle ajoute `tv/ambient.py`,
  `tv/luna.py`, le service Tailscale (source et nom installé) et l'appli `org.tvlens.ambient`. Elle nomme
  ce qui est préservé, et renvoie à `tv/manifest.json` comme référence.
- À ne pas toucher :
  - le code de la TV (`tv/*.py`, `tv/remote/`, `tv/app/`), y compris les replis `except Exception` de
    `controller.py` et `capture.py` ;
  - les tests Python existants ;
  - les scripts d'empaquetage de lot:L09 ;
  - la TV : aucune commande ssh, aucune copie.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `python3 -B -m unittest discover -s tests -p "test_tv_manifest.py"` passe.
2. Le test vérifie, chaque point avec son propre cas :
   - tout fichier source du manifeste existe ;
   - aucun fichier listé ne porte un nom privé (`connection.json`, `connection.js`, `ambient.json`,
     `ambient-settings.json`, `device-token`, `*.env`) ni ne figure parmi les préservés ;
   - chaque chaîne littérale `/media/developer/…` des points d'entrée Python et de leurs imports (par
     exemple `tvlens_mapper.py:5`) est une destination listée ou préservée du manifeste ;
   - les destinations (dossier et chemin relatif) sont uniques ;
   - la fermeture des imports, calculée par `ast` sur tout l'arbre de chaque fichier (imports dans une
     fonction ou un `try` compris), depuis chaque point d'entrée. Un import de premier niveau absent de
     `sys.stdlib_module_names` doit se résoudre en un fichier `.py` listé dans le même composant, situé dans
     le dossier de l'importeur ou dans un dossier d'import déclaré ;
   - chaque chemin `/media/developer/…` cité par un crochet listé est la destination d'un point d'entrée ou
     d'un fichier préservé ;
   - chaque chemin de dépôt cité dans la table de `docs/lg-installation.md` est une source du manifeste, et
     chaque destination du manifeste figure dans la table.
3. Essais d'échec notés au journal, chacun annulé ensuite :
   - retirer `luna.py` du manifeste fait échouer la fermeture des imports, avec un message qui nomme
     `luna` et `ambient.py` ;
   - retirer la ligne de `tv/ambient.py` de la table fait échouer l'accord avec la documentation.
4. `python3 -B -m unittest discover -s tests -p "test_*.py"` passe : les autres tests Python sont
   inchangés et verts.
5. `node scripts/check.mjs --changed` est vert. Format et lint sont rapportés « non lancés » s'ils le sont.

## Test d'acceptation attendu

`tests/test_tv_manifest.py`, nouveau. Frontière : le manifeste, les sources Python et les crochets du
dépôt, lus comme fichiers (`json`, `ast`, `pathlib`). Le premier cas prouve la fermeture des imports du
compagnon : `controller.py`, `capture.py` et `ambient.py` mènent à `transport.py` et `luna.py`, qui doivent
y figurer.

## Hypothèses bloquantes

Aucune décision n'est attendue.

- Le manifeste dit ce que le code exige, pas ce que la TV de test contient aujourd'hui. L'écart se mesurera
  par l'essai à blanc de `deploy-tv`, une action du propriétaire. Le journal note comme non vérifiée la
  présence réelle de `ambient.py` et `luna.py` sur la TV.
- `sys.stdlib_module_names` est celui du Python du Mac. Si un module de la bibliothèque standard importé par
  le code de la TV manque au Python de la TV, ce test ne le voit pas : le journal le note.
- Si, au moment du traitement, lot:L09 n'a pas déplacé `prototypes/lg-remote/` : verdict BLOQUÉ. Écrire le
  manifeste sur des chemins voués à changer ferait deux fois le travail.

## Journal
