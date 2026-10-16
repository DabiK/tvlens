---
id: T205
titre: Guard context subzones, public entry points and temporary exceptions
statut: a-faire
bloque_par: T202, T228
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La garde sait déclarer les contextes, leurs points d'entrée publics et les exceptions de migration
qui doivent disparaître. Un nouveau sous-dossier impose des permissions explicites à ses consommateurs,
et un domaine ne peut importer celui d'un autre contexte, même par son point d'entrée.

## Sources

- `docs/domaine.md`, sections 6 à 8 ; ADR 0029 et 0030 : la garde précède les sous-zones et les
  extractions. T025 est intégré (`f9cb0e9`) ; T030 ajoute les frontières présentation/paquets/état,
  T202 le stock du temps global et la table des modules purs. Relire leur garde livrée et la prolonger.
- Code vérifié à `dd5efc9` : table `tests/architecture.test.cjs:7`, sélection de zone au préfixe
  le plus long à `:16`, résolution fichier/extensions/index à `:103`, inventaire partagé à `:121`.
  `tests/architecture.test.cjs:150` exige le motif exact de destination dans les permissions source.
- `tests/architecture-guard.test.cjs:27` copie la vraie garde dans un arbre temporaire ; `:38`
  exige que les gardes sélectionnées s'exécutent. Son cas à `:291` prouve déjà la sélection de
  sous-zone côté origine et destination, mais ne propose ni entrée publique ni exception temporaire.
- Appelant : `scripts/check.mjs:167` pour la découverte, `:173` pour l'exécution séquentielle. T201 prévoit aussi
  `core/shared/domain-error.cjs` : il peut avoir créé le noyau avant cette garde, contrairement à
  l'hypothèse « première sous-zone dans T206 ». Aucun second diffuseur ou catalogue n'en découle.
- Limite actuelle : `tests/architecture.test.cjs:57` et `:98` ne relèvent ni imports calculés,
  ni imports dans interpolations, ni spécificateurs entre accents graves. Ce ticket n'étend pas le lexer.

## Périmètre

- Modifier `tests/architecture.test.cjs`, `tests/architecture-guard.test.cjs` et `CONTRIBUTING.md` ;
  écrire un ADR court qui applique les frontières acceptées et décrit les exceptions transitoires.
  Réutiliser l'inventaire et la table uniques ; ne créer aucun sous-dossier produit ni paquet.
- Ajouter aux données de zone les informations nécessaires pour reconnaître contexte, couche,
  noyau partagé et point d'entrée. Garder la sélection du motif le plus précis et l'absence
  d'héritage implicite : autoriser `core/**` n'autorise pas `core/memory/**`.
- Pour un consommateur extérieur à un contexte, seule son entrée résolue `core/<contexte>/index.cjs`
  est accessible, après permission explicite. Un import de dossier résolu vers cet index est
  équivalent ; un chemin normalisé vers un module interne reste interdit. Les imports internes au
  même contexte sont permis suivant sa zone ; `core/shared/` est un noyau, pas un autre contexte.
- Refuser domaine A → domaine B, index compris, même si une permission de table l'autoriserait.
  `runtime/<contexte>/` peut lire une entrée publique étrangère si sa permission le déclare.
  Aucune permission produit nouvelle ne doit être déduite d'un simple préfixe anglais.
- Le code plat (`core/*.cjs` et `runtime/*.cjs` hors sous-dossier) n'appartient à aucun contexte,
  et l'interdiction entre domaines ne s'y applique pas. Il atteint un contexte par son entrée
  publique, avec une permission. Un module de contexte n'atteint un module plat que par une
  exception temporaire exacte, jusqu'au rangement de ce module.
- Une exception temporaire déclare nom stable, fichier source, destination résolue exacte et raison.
  Elle ne couvre qu'une arête de migration ; aucun joker de dossier. Elle échoue si son fichier ou
  son import disparaît, ou si l'arête devient permise sans elle. Une exception ne lève pas les
  interdictions de globales, de temps, d'Electron ou de paquets. Aucune exception ne légalise
  domaine A → domaine B ; elle sert notamment aux façades et réexports transitoires du code plat.
- Exercer les contextes fictifs et leurs permissions seulement dans les copies temporaires.
  La ligne `core/shared/**`, déclarée ici si le dossier existe, sinon par T206, est importable par
  toute zone qui importe `core/**` et par chaque ligne de contexte. Un ticket qui ajoute un module
  au noyau, comme T201, ne modifie pas la garde. Aucune zone produit vide n'est nécessaire.
  Les tickets créant ensuite une zone doivent ajouter sa ligne et les permissions de leurs lecteurs.
- Ne modifier ni produit, harnais, planchers, dépendances ou règles livrées par T030/T202.

## Critères d'acceptation

1. Dans l'arbre temporaire, un import permis vers `core/**` devient refusé après déclaration de
   `core/memory/**`. Le diagnostic donne source, destination, zones retenues et permission précise
   manquante. Son ajout rend vert seulement l'import public autorisable, pas les modules internes.
2. Depuis une application, `core/memory/index.cjs` et son import de dossier résolu passent avec
   permission ; un fichier interne échoue malgré cette permission. Même contexte vers module
   interne et contexte vers noyau partagé ont leurs cas verts ; chaque faute retirée revient au vert.
   `core/session.cjs` → `core/memory/index.cjs` passe avec permission.
   `core/memory/lanes.cjs` → `core/passage-text.cjs` échoue sans exception et passe avec une
   exception exacte. Les deux chemins sont des fixtures de l'arbre temporaire.
3. Depuis `core/inquiry/`, importer l'entrée ou un module de `core/memory/` échoue, même avec
   permission artificielle. Le diagnostic explique l'interdiction de domaine, sans conseiller une
   permission qui la contournerait. Depuis `runtime/inquiry/`, seule l'entrée permise passe.
4. Une exception exacte autorise une arête de façade de fixture. Changer la source ou la destination
   reste rouge ; retirer l'import, retirer le fichier ou rendre l'arête normalement permise rend
   l'exception inutile et fait échouer la garde jusqu'à suppression de sa déclaration.
5. Les nouvelles preuves utilisent les formes d'import et résolutions déjà reconnues, commentaires
   ignorés. Les cas de T030/T202 continuent à s'exécuter réellement, y compris si les filtres de
   nom évoluent. Les sorties distinguent refus de politique et défaut du banc.
6. La garde passe sur le dépôt ; journal des zones existantes et permissions réellement ajoutées.
   À l'implémentation, exécuter architecture puis architecture-guard en séquentiel, les suites TV
   affectées par leurs fixtures, puis `node scripts/check.mjs`. Aucun cas ni plafond ne baisse.

## Test d'acceptation attendu

`tests/architecture-guard.test.cjs` conduit la vraie garde sur des arbres temporaires complets.
Le premier scénario retire le droit implicite à un consommateur lors de la déclaration d'une sous-zone,
puis prouve que permission, entrée publique et interdiction entre domaines sont trois contrôles distincts.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La table livrée après T030/T202 sera lue au démarrage : les repères présents décrivent `dd5efc9`,
pas leur implémentation future. Les chemins calculés et gabarits restent une limite nommée de la
garde lexicale. Une arête produit contraire à la cible est signalée, sans permission large ajoutée
pour masquer le conflit. Le stock gelé du temps et les gardes existantes restent indépendants.

## Journal
