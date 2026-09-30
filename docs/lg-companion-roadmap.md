# TVLens — Companion LG et calcul distant

Proposition de tickets · 30 septembre 2026 · **à relire avant publication**.

## État actuel — après livraison du companion et du VPS

Le parcours YouTube → capture LG → moteur Mac ou VPS → réponse dans le companion est implémenté et confirmé par l’utilisateur. Le domaine est partagé avec l’app Mac. La frise basse et le chat droit sont deux vues exclusives ; les détails et questions attachées à un moment sont livrés. Voir [frise](lg-timeline.md), [capture](lg-capture-control.md) et [VPS](vps-deployment.md).

Deux choix ont évolué par rapport au contrat initial : la voix passe par le micro du clavier LG, pas par la récupération directe du bouton micro physique ; le VPS est servi en HTTP à l’intérieur de Tailscale, sans endpoint HTTPS public. L’ouverture se fait avec Rakuten sur la télécommande configurée. Ces écarts sont explicites : les anciens critères ne sont pas tous cochés par assimilation.

| Ensemble | État actuel |
| --- | --- |
| LG-01 à LG-06 | Parcours fonctionnel livré avec voix via clavier ; tests longs, publicités, synchronisation calibrée et reboot restent partiels |
| LG-07 à LG-10 | Parité Mac/TV incomplète : relecture/ouverture des sources, marque-pages durables, recherche dédiée et interface Auto à poursuivre |
| LG-11 | Runtime Linux et fournisseurs réels validés ; débit continu insuffisant sur les premiers blocs VPS, optimisation/mesure longue à faire |
| LG-12 | TV → VPS privé Tailscale livré ; transport différent du TLS public prévu initialement, retour au Mac documenté mais pas rejoué de bout en bout |
| LG-13 | Non terminé : recette complète et parité de fonctionnalités encore ouvertes |

Prochaines priorités : mesurer et réduire le retard d’analyse sur VPS, valider le redémarrage complet et les interruptions longues, puis compléter les fonctions TV. L’expérimentation GX10 vise l’inférence locale et le débit soutenu. Les brouillons de tickets ci-dessous conservent leurs critères originaux et ne sont pas des issues publiées.

## Plan initial et journal historique

Les sections suivantes conservent le raisonnement et les états intermédiaires. Les mentions « à prouver » ou « prochain incrément » décrivent ces étapes ; l’état courant ci-dessus prévaut.

## Contrat retenu

Conserver l’application YouTube existante. TVLens est un companion indépendant : vidéo réduite à côté d’une sidebar, question par le bouton micro direct de la télécommande, lecture continue pendant la dictée. Première cible : la LG actuelle, une session personnelle, démarrage manuel. Tester TV → Mac puis TV → VPS Hostinger (8 Go). L’app Mac reste disponible ; les trois interfaces partagent le domaine et ses ports.

Codex assure chat et vision ; la transcription tourne sur l’hôte de calcul ; OpenRouter reste réservé aux embeddings texte. Les embeddings multimodaux restent hors de cette tranche. Le VPS reçoit les médias : ce mode n’a pas la confidentialité d’un traitement entièrement à domicile.

## Ce qui existe et ce qui reste incertain

Le cœur possède déjà mémoire, file, ancrage des questions, réexamen, recherche, marque-pages et Auto. On les adapte aux nouveaux transports et vues, sans les reconstruire. La composition et certaines dépendances système restent liées au Mac/Electron.

Le test LG de 30 secondes a obtenu 15 captures à deux secondes d’intervalle et du son, sans interrompre YouTube. C’est une preuve courte de capture par commandes natives, pas une preuve de streaming poussé, de synchronisation calibrée ou de fonctionnement prolongé. La relecture reconstruite à partir de ces captures ne contient pas les actions entre les images.

**Deux conditions restent à prouver :** la réduction de YouTube avec une sidebar indépendante et l’accès direct au bouton micro sans interrompre le programme. Le root seul ne les garantit pas. Si l’une échoue, on rapporte le blocage et on rediscute le produit ; on ne remplace pas discrètement YouTube par un lecteur intégré.

## Ordre proposé

Mise à jour du 30 septembre : **LG-03/04/05 en cours**. La composition partagée, l’ingestion authentifiée TV → Mac et le client sidebar sont implémentés. Deux captures YouTube réelles (48 et 32 secondes) et des questions Codex ont passé les essais ; après confirmation de disponibilité, la nouvelle UI a été déployée et l’utilisateur a confirmé dictée, navigation et réponse sur la TV. Voir [résultats, installation et limites](lg-remote-runtime.md). Les critères restants restent ouverts.

Les numéros ci-dessous sont locaux, pas des numéros d’issues GitHub. Aucun ticket n’est déclaré livré. LG-01 est en cours : [premiers essais réels et limites](lg-sidebar-validation.md). Les tickets 01 et 02 sont des tests de faisabilité : leurs dépendants nécessitent un résultat positif, pas seulement un rapport terminé.


| Ticket | Livrable | Bloqué par |
| --- | --- | --- |
| [LG-01](lg-companion-tickets/01.md) | Sidebar indépendante à côté de YouTube | Aucun |
| [LG-02](lg-companion-tickets/02.md) | Question via le bouton micro LG sans interruption | Aucun |
| [LG-03](lg-companion-tickets/03.md) | Extraire le runtime partagé sans changer l’app Mac | Aucun |
| [LG-04](lg-companion-tickets/04.md) | Session manuelle TV vers Mac par le réseau | LG-03 |
| [LG-05](lg-companion-tickets/05.md) | Première question vocale et réponse dans la sidebar | LG-01, LG-02, LG-04 |
| [LG-06](lg-companion-tickets/06.md) | Coupures réseau, pause et reprise sans mélange de sessions | LG-04 |
| [LG-07](lg-companion-tickets/07.md) | Sources et relecture depuis une réponse TV | LG-05 |
| [LG-08](lg-companion-tickets/08.md) | Garder et supprimer un moment depuis la TV | LG-05 |
| [LG-09](lg-companion-tickets/09.md) | Retrouver un passage dans la session sur TV | LG-07 |
| [LG-10](lg-companion-tickets/10.md) | Surveillance Auto ciblée depuis la sidebar | LG-05 |
| [LG-11](lg-companion-tickets/11.md) | Même session sur un hôte Linux sans Electron | LG-03, LG-04 |
| [LG-12](lg-companion-tickets/12.md) | TV vers VPS personnel en HTTPS | LG-06, LG-11 |
| [LG-13](lg-companion-tickets/13.md) | Validation complète du companion et installation reproductible | LG-07, LG-08, LG-09, LG-10, LG-12 |

## Par quoi commencer

**LG-01, puis LG-02.** Ils testent le contrat d’expérience avant l’investissement serveur. LG-03 est le prérefactoring nécessaire au runtime distant ; il peut être entrepris indépendamment, mais ne résout pas les risques LG.

Après les deux preuves positives : LG-03 → LG-04 → LG-05 donne la première démonstration complète sur Mac. Durcir ensuite réseau et preuves. Les fonctions mémoire/Auto et la préparation Linux peuvent suivre leurs dépendances propres ; LG-13 clôt la livraison, pas la première démo.

Ne pas promettre de délai global avant les tests LG. Chaque ticket doit produire une démonstration ou un rapport vérifiable ; si l’exploration système devient trop large, découper selon les résultats au lieu d’empiler des installations.

## Limites et décisions d’implémentation

- Tampon réseau : proposition initiale de 30 secondes maximum, à confirmer par mesure ; limites de taille également requises.
- La capture reste indépendante des questions. Conserver cinq minutes détaillées, contexte de session, FIFO et limite de 60 secondes hors attente.
- Le réexamen ne peut récupérer une action jamais capturée. Mesurer la couverture réelle avant de choisir une cadence plus élevée.
- Réutiliser les caches et contrôles de provenance existants ; une citation issue d’OCR ou de transcription reste une observation incertaine.
- Sur Linux, huit Go de RAM ne prouvent pas que transcription et ingestion tiendront le rythme : LG-11 le mesure.
- Les tickets LG-08 à LG-10 complètent l’expérience ; ils ne bloquent pas la première question dans la sidebar.
- Netflix, Prime, HDMI, TNT, multi-utilisateur et modèles locaux GX10 sont hors premier livrable. Ne pas promettre de capture DRM.
- Aucune modification VPN, firmware ou installation système nouvelle n’est incluse dans cette préparation de roadmap.

## Publication

Découpage préparé avec [to-tickets](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md). Les fichiers liés sont des brouillons versionnables, pas un backlog publié. Après revue de la granularité et des dépendances, publier dans le tracker retenu avec liens de blocage réels. Si la configuration du workflow manque, utiliser `/setup-matt-pocock-skills` avant cette publication.

## Exploration ultérieure : moteur embarqué sur la TV

Voir le [POC agent / LLM dans la TV](lg-on-device-exploration.md). Cette piste ne remplace pas LG-03 → LG-04 → LG-05 et n’est pas un prérequis du VPS.

### Prochain incrément après les tests d’interface

Le prototype affiche la sidebar, réduit YouTube et s’ouvre depuis Rakuten. L’utilisateur a confirmé la dictée via le clavier LG ; le micro physique direct reste géré par LG. Le parcours retenu pour la prochaine intégration est donc Rakuten → champ de dictée → question.

Commencer par **LG-03**, puis **LG-04** et **LG-05** : extraire le runtime partagé, recevoir réellement image/son depuis la TV sur le Mac, puis transmettre la question et afficher la réponse dans la sidebar. Réutiliser la mémoire existante dès ce branchement, sans recréer un moteur séparé. Les limites du prototype (publicités, fermeture, délai d’affichage et redémarrage) restent à traiter avant validation complète ; ne pas marquer LG-01/LG-02 terminés par assimilation au nouveau parcours.

### Contrôle de capture et reprise réseau

Les boutons Démarrer/Arrêter/Reprendre sont implémentés et confirmés sur la TV. Le tampon/retry et la déduplication ont été testés avec une coupure de 12 secondes sur des médias réels. La limite de 170 secondes du panneau a été remplacée par un heartbeat. Voir [validation, incidents et limites restantes](lg-capture-control.md). LG-04/LG-06 progressent ; synchronisation calibrée, pannes prolongées, reboot et VPS ne sont pas déclarés validés.
