---
id: T140
titre: State what runs on the test TV and the server in one place
statut: a-faire
bloque_par: T108, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`README.md` et `SECURITY.md` affirment ou nient l'état de déploiement à plusieurs endroits, et ces endroits
se contredisent. Une ligne dit la version du 13 octobre installée sur la TV de test et le VPS. Une autre dit
que les écrans de surveillance et de sessions de la TV ne sont « pas encore déployés ». Le livrable de la
nuit précise que la version installée a été construite depuis l'arbre de travail, pas depuis une révision
Git. T108 a retiré cet état des pages de référence. Après ce ticket, l'état de déploiement est écrit à un
seul endroit, avec la révision installée et sa date. Les autres pages y renvoient sans le répéter.

## Sources

- Constats : DOC-02
- Documents, à la version `0d5a954` :
  - `README.md`, bandeau « Version installée sur la TV de test » (ligne 89) : installation sur la TV de
    test et le VPS le 13 octobre 2026 au matin, par la supervision.
  - `README.md`, paragraphe « Les interfaces n'ont pas encore toutes les mêmes commandes » (ligne 103) :
    les écrans TV de la surveillance et des sessions archivées sont « écrits, pas encore déployés ni
    validés sur l'appareil ».
  - `README.md`, section « Ce qui est prouvé, ce qui reste à mesurer », deuxième puce (ligne 170) :
    « Installés sur la TV de test et le VPS le 13 octobre au matin par la supervision… (livrable,
    section 13) ».
  - `SECURITY.md`, section « 6. Avant tout déploiement » (ligne 155), paragraphe « Sur le serveur de
    référence (13 octobre 2026) » (ligne 161) : « La supervision a installé cette branche… ».
  - `docs/night-features-delivery.md` :
    - ligne 79, point 6 « Figer une révision » : « La version installée a été construite depuis l'arbre
      de travail, pas depuis une révision Git, et l'arbre a encore changé après elle » ;
    - section « 13. Installation sur le VPS et la TV, faite par la supervision » (ligne 966).
  - Commande qui liste les affirmations d'installation :
    `grep -nE "TV de test et (sur )?le VPS|supervision a installé" README.md SECURITY.md` renvoie
    `SECURITY.md:161`, `README.md:89` et `README.md:170`.

## Périmètre

- Un seul endroit porte l'état de déploiement : une section « Version en service » de `README.md`. Elle dit
  ce qui tourne sur la TV de test et sur le serveur, depuis quelle révision et à quelle date, et ce qui n'y
  est pas. Le contenu vient de la décision du propriétaire, et de rien d'autre.
- `README.md`, ligne 103 et deuxième puce de la section « Ce qui est prouvé » : l'état de déploiement est
  retiré, et un renvoi mène à la section. La preuve (tests, parcours) reste.
- `README.md`, bandeau de la ligne 89 : remplacé par le renvoi, ou supprimé si la section suffit.
- `SECURITY.md`, paragraphe de la ligne 161 : ce qui a été relevé sur le serveur (réglages Codex confirmés)
  reste, avec sa date. La phrase sur l'installation renvoie à la section du README.
- À ne pas toucher : `docs/night-features-delivery.md` (rapport daté), le code, `deploy/`. Aucune
  commande n'est lancée sur la TV ou le VPS.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -nE "pas encore déployés|Version installée sur la TV de test" README.md` ne renvoie rien.
2. `grep -c "^## Version en service" README.md` vaut 1. La section nomme une révision (SHA ou étiquette),
   ou dit en toutes lettres que la version installée ne correspond à aucune révision. Commande, qui doit
   renvoyer au moins une ligne :
   `awk '/^## Version en service/{p=1;next} p&&/^## /{exit} p' README.md | grep -nE "[0-9a-f]{7,40}|v[0-9]+\.[0-9]+|aucune révision"`.
3. `grep -nE "TV de test et (sur )?le VPS|supervision a installé" README.md SECURITY.md` ne renvoie que des
   lignes de la section « Version en service ».
4. `node --test tests/documentation-links.test.cjs` et `node --test tests/documentation-index.test.cjs`
   passent.
5. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

Aucun nouveau test. Les tests de documentation existants gardent les liens. L'unicité de l'état se vérifie
par les commandes des critères 1 à 3.

## Hypothèses bloquantes

Décision attendue du propriétaire : la version de la nuit tourne-t-elle encore sur la TV de test et sur le
VPS, et depuis quelle révision ? D'après `docs/night-features-delivery.md` (ligne 79), elle a été installée
depuis l'arbre de travail. Les écrans de surveillance et de sessions de la TV sont-ils déployés ? Sans cette
réponse, le ticket ne peut rien affirmer. Aucune vérification n'est faite sur la TV ou le VPS par la session.

## Journal
