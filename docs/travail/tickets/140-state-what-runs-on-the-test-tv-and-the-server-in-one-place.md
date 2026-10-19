---
id: T140
titre: State what runs on the test TV and the server in one place
statut: a-faire
bloque_par: T108, T294
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`README.md`, `SECURITY.md` et deux pages de `docs/` affirment ou nient l'état de déploiement à plusieurs
endroits, et ces endroits se contredisent. Une ligne dit la version du 13 octobre installée sur la TV de test et
le VPS. Une autre dit que les écrans de surveillance et de sessions de la TV ne sont « pas encore déployés ». Le
livrable de la nuit précise que la version installée a été construite depuis l'arbre de travail, pas depuis une
révision Git. Depuis, chaque recette installe un tag, et une release figée sur le VPS ; seuls les journaux de
tickets le disent. T108 a retiré cet état des pages de référence. Après ce ticket, l'état de déploiement est
écrit à un seul endroit, avec la révision installée et sa date. Les autres pages y renvoient sans le répéter.

## Sources

- Constats : DOC-02
- Documents, à la version `1178657` :
  - `README.md`, bandeau « Version installée sur la TV de test » (ligne 89) : installation sur la TV de
    test et le VPS le 13 octobre 2026 au matin, par la supervision.
  - `README.md`, paragraphe « Les interfaces n'ont pas encore toutes les mêmes commandes » (ligne 111) : les
    écrans TV de la surveillance et des sessions archivées sont « écrits, pas encore déployés ni validés sur
    l'appareil ».
  - `README.md`, section « Ce qui est prouvé, ce qui reste à mesurer » (ligne 175), deuxième puce (ligne 178) :
    « Installés sur la TV de test et le VPS le 13 octobre au matin par la supervision… (livrable, section 13) ».
  - `SECURITY.md`, section « 6. Avant tout déploiement » (ligne 155), paragraphe « Sur le serveur de
    référence (13 octobre 2026) » (ligne 161) : « La supervision a installé cette branche… ».
  - `docs/interface.md`, encadré de la ligne 72 : le code du 13 octobre 2026 « a été installé sur la TV de test
    et le VPS le 13 octobre 2026 au matin par la supervision ».
  - `docs/vps-deployment.md`, ligne 5 : « Ce relevé décrit la version déployée, que la mission du 13 octobre 2026
    n'a pas touchée. »
  - `docs/night-features-delivery.md` :
    - ligne 79, point 6 « Figer une révision » : « La version installée a été construite depuis l'arbre
      de travail, pas depuis une révision Git, et l'arbre a encore changé après elle » ;
    - section « 13. Installation sur le VPS et la TV, faite par la supervision » (ligne 966).
  - Commande qui liste les affirmations d'installation :
    `grep -nE "TV de test et (sur )?le VPS|supervision a installé" README.md SECURITY.md docs/interface.md`
    renvoie `README.md:89`, `README.md:178`, `SECURITY.md:161` et `docs/interface.md:72`.
- `README.md` : le 16/10, le propriétaire a décidé que le README de présentation resterait celui de `main`
  pendant le hackathon (T108, « Périmètre ») ; `1f57bb3` l'y a remis le 17/10. Le 18/10, `e927cd7` (« Use the
  up-to-date README on main ») a mis sur `main` le README de la branche, avec les trois passages ci-dessus.
- `tests/documentation-index.test.cjs` : tout document de premier niveau de `docs/` doit être lié depuis
  `docs/README.md` ; les liens des pages de référence (`docs/architecture.md`, `docs/README.md`,
  `CONTRIBUTING.md`) visent des fichiers publiés, et ces pages refusent les affirmations de déploiement. À
  `1178657`, `experiments/` n'est pas suivi par Git : un lien vers ses comptes rendus ne compte pas comme publié.
  `tests/documentation-links.test.cjs`, cité à l'origine, n'existe pas et n'a jamais existé dans l'historique.
- Faits de déploiement : journaux de T233, T275 et T289 (`docs/travail/tickets/233-*.md`, `275-*.md`,
  `289-*.md`) ; comptes rendus `experiments/essais/2026-10-18-recette-tv-vps/` et `2026-10-18-panneau-tv/`, hors
  Git ; tags `hackathon-rc` (`633e6d8`), `recette-t233` (`e2696c2`), `recette-t268` (`4606dca`) et `recette-t289`
  (`e26ac28`). `git diff --stat recette-t233 recette-t289 -- tv/` ne liste que `tv/app/sessions-view.js`,
  `tv/capture.py` et `tv/controller.py`.

## Périmètre

- Un seul endroit porte l'état de déploiement : une section « Version en service » d'un document de `docs/`,
  lié depuis `docs/README.md`. Elle dit ce qui tourne sur la TV de test et sur le serveur, depuis quelle révision
  et à quelle date, et ce qui n'y est pas ; elle décrit aussi la méthode des releases figées. Le contenu vient des
  faits écrits dans la section « Hypothèses bloquantes », et de rien d'autre.
- `SECURITY.md`, paragraphe de la ligne 161 : ce qui a été relevé sur le serveur (réglages Codex confirmés)
  reste, avec sa date. La phrase sur l'installation renvoie au document.
- `docs/interface.md`, ligne 72, et `docs/vps-deployment.md`, ligne 5 : l'affirmation d'installation est remplacée
  par un renvoi au document ; les faits datés restent.
- `README.md`, lignes 89, 111 et 178 : selon la décision attendue ci-dessous. Si le README peut changer, l'état de
  déploiement est retiré de ces trois passages et un renvoi mène au document ; la preuve (tests, parcours) reste.
  Sinon, `README.md` n'est pas touché.
- À ne pas toucher : `docs/night-features-delivery.md` et `docs/tvlens-night-tickets.md` (rapports datés), le
  code, `deploy/`. Aucune commande n'est lancée sur la TV ou le VPS.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -l "^## Version en service" README.md SECURITY.md docs/*.md` renvoie un seul fichier, sous `docs/`, où
   `grep -c "^## Version en service"` vaut 1 ; `docs/README.md` le lie.
2. La section nomme une révision (SHA ou étiquette), ou dit en toutes lettres que la version installée ne
   correspond à aucune révision. Commande, avec `DOC` le fichier du critère 1, qui doit renvoyer au moins une
   ligne :
   `awk '/^## Version en service/{p=1;next} p&&/^## /{exit} p' "$DOC" | grep -nE "[0-9a-f]{7,40}|v[0-9]+\.[0-9]+|aucune révision"`.
3. `grep -nE "TV de test et (sur )?le VPS|supervision a installé" SECURITY.md docs/interface.md` ne renvoie rien,
   et `grep -n "Ce relevé décrit la version déployée" docs/vps-deployment.md` non plus.
4. `README.md`, selon la décision : s'il peut changer,
   `grep -nE "pas encore déployés|Version installée sur la TV de test|TV de test et (sur )?le VPS" README.md`
   ne renvoie rien ; sinon, `git diff --exit-code -- README.md` est vide.
5. `node --test tests/documentation-index.test.cjs` passe.
6. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

Aucun nouveau test. `tests/documentation-index.test.cjs` garde l'index et les liens. L'unicité de l'état se
vérifie par les commandes des critères 1 à 4.

## Hypothèses bloquantes

Décision attendue du propriétaire : le `README.md` peut-il de nouveau changer ? Le 16/10, le propriétaire a voulu
que le README de présentation reste celui de `main` pendant le hackathon ; la décision du 17/10 ci-dessous en
tirait que le README ne change pas. Depuis le 18/10 (`e927cd7`), `main` porte le README de la branche, avec les
trois passages périmés des lignes 89, 111 et 178. Si oui, ils renvoient au document unique ; si non, le README
reste tel quel et ces passages restent faux (critère 4).

Faits établis, que la session ne revérifie pas : aucune commande n'est lancée sur la TV ou le VPS.

- Décision de l'orchestrateur, le 17/10, par délégation du propriétaire : l'endroit unique est un document de
  `docs/`, auquel le reste renvoie, et il décrit aussi la méthode des releases figées. Ce jour-là, la TV de test et
  le VPS faisaient tourner le tag `hackathon-rc` (`633e6d8`). Sur le VPS, c'était la release figée
  `/opt/tvlens/releases/hackathon-rc-20261017-633e6d8`, choisie par le drop-in
  `/etc/systemd/system/tvlens.service.d/night-release.conf` ; `/opt/tvlens/app` n'est pas ce qui tourne. Sur la
  TV, les anciens fichiers ambient restaient présents sans être chargés.
- Mise à jour du 19/10, d'après les journaux de T233, T275 et T289 :
  - VPS : release figée `recette-t233-20261018-e2696c2` (tag `recette-t233`, `e2696c2`), installée le 18/10 ;
    fuseau `TZ=Europe/Paris` posé le même jour par le drop-in `tvlens.service.d/timezone.conf`. Serveur inchangé
    depuis (T275, T289). Les journaux ne nomment pas le drop-in qui choisit cette release.
  - TV, page `org.tvlens.sidebarprobe` et compagnon (`controller.py`, `capture.py`, `transport.py`) : déployés
    depuis `recette-t233` le 18/10, écrans de surveillance et de sessions compris ; puis `tv/capture.py`,
    `tv/controller.py` et `tv/app/sessions-view.js` depuis `recette-t289` (`e26ac28`) le 19/10. Fichier
    d'appairage inchangé.
  - TV, runtime du panneau (`prototypes/lg-remote/runtime`) : déployé en entier depuis `recette-t268` (`4606dca`)
    le 18/10, puis depuis `recette-t289` le 19/10. Le répartiteur de touches en mémoire reste celui d'avant le
    déploiement jusqu'au prochain redémarrage de la TV (T275).

## Journal

- 19/10, orchestrateur : rouvert sur décision du propriétaire (sélection du tri d'Astra) ; sources mises à jour à
  `1178657` ; bloqueurs revus : T145 retiré (file rouverte) ; T108 gardé (terminé) ; T294 ajouté (passe après la
  file en cours). Faits de déploiement mis à jour depuis les recettes du 18 et du 19/10 (`recette-t233`,
  `recette-t268`, `recette-t289`) ; la question du 14/10, tranchée le 17/10, est retirée. Périmètre et critères
  recalés sur la décision du 17/10 (document de `docs/`), qui ne l'avaient pas suivie. Lignes du README recalées
  (111 et 178) ; `docs/interface.md:72` et `docs/vps-deployment.md:5` affirment aussi un état installé : ajoutés.
  Le critère sur `tests/documentation-links.test.cjs`, qui n'existe pas, passe à `tests/documentation-index.test.cjs`.
  Le sort du README redevient une question pour le propriétaire depuis `e927cd7`.
