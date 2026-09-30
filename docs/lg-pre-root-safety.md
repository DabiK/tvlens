# LG : préparation avant root — 30 septembre 2026

Statut final : root réussi via voiceweb, Homebrew Channel 0.7.3 installé, accès SSH root par clé vérifié après redémarrage. Les premières tentatives infructueuses et les limites de sauvegarde sont conservées ci-dessous. Ce dossier n'est pas une sauvegarde restaurable du système et ne garantit pas la garantie constructeur.

## État initial

- LG 75QNED87T6B.BEUFLJP ; firmware 33.31.75 et webOS 25 / 10.3.2-33 communiqués par le propriétaire.
- Appairage SSAP et lecture du modèle réussis ; liste de 159 applications sauvegardée localement (identifiant, nom, version disponibles).
- Homebrew Channel, PicCap et LG Developer Mode non trouvés dans cette liste. Ce constat n'est pas une analyse forensique de l'état du système.
- Ports 22 et 23 fermés ou filtrés ; 3000 et 3001 ouverts au moment de la mesure.
- Mac → TV validé par SSAP ; TV → Mac confirmé par le propriétaire avec l'affichage de son portfolio. Le premier port HTTP choisi (8080) était partagé avec Docker : ne pas utiliser ce port pour la suite.
- Applications présentes : adoverlayex, adoverlay, tinybrowser, dangbei-overlay. Leur présence ne prouve pas que leurs vulnérabilités sont exploitables.
- Échecs conservés : lecture firmware refusée par SSAP ; première lecture des applications refusée faute de permission ; première réponse autorisée supérieure à la limite de 128 Kio du client. Lecture réussie après demande de permission READ_INSTALLED_APPS et plafond de réponse porté à 4 Mio.

La base CanI.RootMy.TV associe QNED87T6B à HE_DTV_W24H_AFADATAA, variante ponytail pour les firmwares 33. Elle référence 33.31.68 / 10.3.1-3006 comme dernière version vulnérable connue pour SlopBro/Dangbro. L'identifiant OTA est une correspondance de catalogue, pas une mesure directe sur cette TV. 33.31.75 n'est pas confirmé dans cette base.

## Archives et intégrité

Les fichiers privés sont dans `.scratch/lg-pre-root-2026-09-30/`, ignorés par Git. La clé d'appairage reste dans son fichier existant ; elle n'est pas incluse dans l'archive de préparation.

- SlopBro figé au commit `21023d56ca424607bb03d2939609cc658c655fc7` : README, lanceur et quatre fichiers wwwroot. Téléchargés comme données, jamais exécutés ni servis à la TV.
- Chaque fichier possède une empreinte SHA-256 dans `manifest.json`.
- Homebrew Channel 0.7.3 archivé ; SHA-256 `d10bf3c753551d7c72fb7a92b20fcd2317e502a220ac668ba8e76f6ea78b363c`, identique au digest publié par l'API GitHub. Une empreinte assure l'identité du fichier, pas l'absence de défaut.
- Paquet inspecté comme archive, sans exécution de ses scripts ou binaires.
- Page LG archivée : modèle exact mentionné dans la liste applicable au firmware 33.31.75. Le manifeste local indique si le ZIP a effectivement été téléchargé et vérifié. Ce fichier de mise à jour n'est ni une copie de la TV ni une procédure de récupération validée.

## Résultats de l'examen statique

Le lanceur normal ouvre une application système puis télécharge et exécute les fichiers de l'exploit. Ne pas utiliser `--test-server payload` comme test sans modification.

Le script autoroot modifie `/var/luna/preferences/devmode_enabled`, redémarre appinstalld, installe Homebrew et appelle son binaire `elevate-service`. Il peut renommer un ancien start-devmode.sh dont la signature est invalide. Il n'a pas de transaction de rollback ; un échec peut laisser un état partiel.

Le démarrage Homebrew 0.7.3 lance **Telnet root sans authentification par défaut**, sauf présence de son indicateur de désactivation. Son mode de secours peut aussi lancer Telnet. SSH est conditionnel ; un mot de passe root par défaut est prévu en l'absence de clés autorisées. Ces comportements exigent un réseau de confiance et une sécurisation explicitement préparée avant une éventuelle installation. Aucun port n'a été ouvert par notre préparation.

Le script de démarrage réalise également des bind mounts, des modifications conditionnelles du fichier hosts et des actions sur la télémétrie. L'audit est partiel : le binaire elevate-service n'a pas été audité instruction par instruction, et rien n'a été validé en exécution sur ce firmware.

## Avant toute éventuelle tentative

1. Photographier les réglages image par entrée/mode, son/eARC, réseau, chaînes et options utiles. Ces réglages ne sont pas sauvegardés automatiquement par notre inventaire.
2. Vérifier l'accès aux comptes nécessaires pour réinstaller les applications ; ne pas placer les mots de passe dans ce dossier.
3. Garder TV/Mac sur un réseau de confiance, sans redirection de ports vers Internet. La configuration du routeur et les règles UPnP n'ont pas été inspectées. Idéalement isoler le réseau de test des autres appareils.
4. Prévoir alimentation stable ; suspendre les autres installations et éviter une mise en veille du Mac pendant une opération. Aucun réglage d'alimentation ou de mise à jour n'a été modifié par l'agent.
5. Avant exécution, choisir un port LAN libre, vérifier de nouveau les empreintes et préparer le traitement des accès Telnet/SSH. Ne pas supprimer les vérifications TLS ni laisser un service root sans authentification accessible au LAN habituel.
6. Définir des points d'arrêt : erreur de service, installation partielle, comportement inattendu. Conserver les journaux, ne pas multiplier les tentatives ou lancer un nettoyage récursif improvisé.
7. Ne pas écrire les partitions système, modifier les menus de service, tenter un downgrade ni ouvrir le téléviseur dans ce scénario.

## Limite de récupération et décision

Aucun dump des partitions, réglages complets ou identifiants DRM n'a été obtenu. Aucun point de restauration ni retour arrière testé n'existe pour cette TV dans ce dossier. Un ZIP LG ne garantit pas une restauration de même version ou un démarrage après corruption. Le reset usine n'est pas une restauration bit à bit de l'état initial.

La demande SlopBro #14 documente des difficultés de retrait manuel ; son auteur présente le reset comme solution, mais ce n'est pas une validation constructeur pour notre modèle. Ne pas créer un script de suppression automatique à partir de ce témoignage.

Le propriétaire a ensuite explicitement autorisé la tentative de root puis sa reprise, en demandant de vérifier les fichiers installés. Cette autorisation ne constitue pas une garantie technique ou constructeur. Si un retour exact à l'état initial est indispensable, arrêter ici et utiliser la capture externe.

## Sources

- https://github.com/throwaway96/slopbro/tree/21023d56ca424607bb03d2939609cc658c655fc7
- https://github.com/webosbrew/webos-homebrew-channel/releases/tag/v0.7.3
- https://github.com/throwaway96/slopbro/issues/14
- https://cani.rootmy.tv/
- https://www.lg.com/no/support/product/lg-75QNED87T6B.AEU

Ce document complète le plan sans modification système de `lg-piccap-test-plan.md` ; il n'autorise pas son ancienne procédure conditionnelle de root.


## Tentatives autorisées et résultat — 30 septembre 2026

Le firmware officiel a été téléchargé intégralement (1 620 397 110 octets), son ZIP vérifié par CRC et son empreinte SHA-256 conservée. Il est archivé dans `Documents/TVLens-backups/LG_33.31.75.zip`. Le téléchargement a auparavant été interrompu par manque d’espace ; aucune opération de root n’avait alors commencé.

Une copie distincte de SlopBro a été adaptée : HTTP lié à l’interface LAN et limité à l’adresse de la TV, port dédié, délai d’attente borné, paquet Homebrew local vérifié, clé SSH dédiée et désactivation prévue du Telnet normal. Le diff et les empreintes sont conservés localement. Ces réglages SSH/Telnet **n’ont pas été appliqués sur la TV**, car le script autoroot n’a jamais été téléchargé. La clé privée reste dans un dossier local séparé, sans diffusion à la TV ni inclusion dans les archives de rapport.

- `adoverlayex` : lancement accepté, aucune requête HTTP reçue.
- `tinybrowser` : page de diagnostic et page SlopBro chargées ; refus explicite de la méthode `download` avant récupération d’autoroot. Aucun paquet d’installation transmis par cette voie.
- `dangbei-overlay` : lancement accepté, interface d’origine en chinois observée par le propriétaire, aucune requête pour la page locale. Même résultat avec le paramètre source de Jsbro et une fenêtre de diagnostic prolongée. L’application figurait déjà dans l’inventaire initial.
- `adoverlay` avec TV en direct au premier plan : pas de page chargée ; écran « Non programmé » signalé. Aucun réglage de chaînes ou de pays modifié.

Les derniers essais ne servaient qu’une page HTML de diagnostic, sans exploit. Les serveurs sont arrêtés. La demande de retour à l’accueil a été acceptée. Les dernières demandes de fermeture d’overlays ont répondu 403 ; leur fermeture individuelle n’est donc pas confirmée (ne pas présenter ce refus comme une fermeture réussie).

Contrôle final : toujours 159 applications, aucun identifiant ajouté ou retiré, Homebrew absent, ports 22/23 fermés ou filtrés. Cela ne constitue pas une vérification bit à bit des fichiers internes ; les appairages et éventuelles traces de navigation/diagnostic existent.

**Blocage : aucune des applications testées ne permet à la fois le chargement de notre page et l’accès au téléchargement nécessaire. Root non réalisé, persistance non validée.** Ces résultats ne prouvent pas que toutes les méthodes sont impossibles sur ce firmware. Aucune nouvelle chaîne d’exploitation, installation de provenance différente, écriture de firmware ou modification de région n’a été tentée.


## Résultat final : réussite via voiceweb

Le code Dualbro (`https://github.com/exkc/e.nya.je/blob/main/getroot/dualbro.js`) propose `com.webos.app.voiceweb` avec les paramètres `source: dualbro` et `URL`, dès webOS 5. La version figée de SlopBro réservait cette entrée à webOS 11 dans sa sélection automatique. C'est cette différence de sélection qui a motivé le nouveau test sur webOS 10 ; elle ne prouve pas une compatibilité universelle.

1. Page locale de diagnostic chargée, PalmServiceBridge présent.
2. Téléchargement d'un fichier texte inoffensif de 58 octets confirmé par la TV : HTTP 200, completed=true, aborted=false, interrupted=false.
3. Après réussite des prérequis, poursuite de la tentative de root déjà autorisée avec la même copie SlopBro et le même paquet Homebrew vérifié. Aucun installateur WTFBro/Jsbro/Dangbro supplémentaire exécuté.
4. Les six fichiers requis sont servis à la TV ; le journal root indique `result: success`, Homebrew Channel élevé et LG Developer Mode absent.
5. Connexion SSH avec la clé dédiée : uid=0(root). Les empreintes du script autoroot, de l'IPK et de la clé publique sur la TV correspondent aux fichiers locaux.
6. Persistance vérifiée : l'heure calculée du démarrage TV (1790722890 environ) est postérieure à la création du hook SSH (1790722874) ; le marqueur de démarrage Homebrew est présent et SSH root fonctionne encore. Aucun redémarrage supplémentaire n'a été envoyé par l'agent. L'identifiant de boot et les sorties sont conservés localement.
7. Le serveur SSH fonctionne avec `-s -j -k` : authentification par mot de passe et redirections TCP désactivées. Une connexion sans clé est refusée avec `Permission denied (publickey)`. Permissions .ssh=700, authorized_keys=600. Telnet est désactivé en démarrage normal et le port 23 est fermé ou filtré.
8. Les cinq fichiers temporaires d'installation ont été supprimés après contrôle individuel de leur empreinte. Le fichier texte de diagnostic reste présent ; il est inoffensif et n'est pas exécuté.

Le mode de secours Homebrew conserve la possibilité d'ouvrir Telnet : sa branche de secours n'a pas été modifiée ni déclenchée pour test. Ne pas exposer la TV à Internet. Le root et les réglages de démarrage sont persistants ; la présence d'une archive officielle LG ne fournit toujours pas de rollback garanti.

Les journaux temporaires `/tmp/slopbro.log` et `/tmp/autoroot.log` ont été lus avant redémarrage, mais avaient déjà disparu au moment de leur copie vers le Mac. L'archive conserve les logs du lanceur, la transcription des résultats de vérification et les tests après redémarrage ; ne pas prétendre disposer d'une sauvegarde complète des logs volatils.

La clé privée SSH est dans `Documents/TVLens-backups/lg-root-access/`, permissions restrictives, exclue des archives de diagnostics et de Git. **Ne pas installer l'application LG Developer Mode tant que ce root est utilisé**, conformément au message de l'installateur Homebrew. PicCap n'a pas été installé et la capture TV n'a pas encore été validée.
