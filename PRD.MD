# TVLens
## Local AI Companion for Everything You Watch

**Version :** 0.1  
**Statut :** Exploration / Hackathon MVP  
**Plateforme cible MVP :** ASUS Ascent GX10 + caméra + microphone + interface second screen  
**Vision produit :** couche d’intelligence multimodale privée capable de comprendre en temps réel n’importe quel contenu diffusé sur une télévision.

---

# 1. Résumé

TVLens est un assistant IA local qui **voit et entend ce que l’utilisateur regarde sur sa télévision**, maintient un contexte temporel du contenu en cours et permet d’interagir avec celui-ci en langage naturel.

Le système ne dépend pas d’une intégration Netflix, YouTube, Canal+, LG webOS ou d’un fournisseur de contenu spécifique.

Une caméra observe l’écran et un microphone récupère l’audio ambiant.

Les flux sont traités localement par un ASUS Ascent GX10.

TVLens peut alors répondre à des questions telles que :

- « C’est qui cette personne ? »
- « Il vient de dire quoi exactement ? »
- « Est-ce que ce chiffre est correct ? »
- « Pourquoi ils parlent de ça ? »
- « C’est où cet endroit ? »
- « Explique-moi ce concept. »
- « Qui était le personnage qu’on a vu tout à l’heure ? »
- « Résume-moi les cinq dernières minutes. »
- « Vérifie cette affirmation. »

Le fact-checking constitue l’un des usages les plus visibles de TVLens, mais le produit est volontairement plus large.

TVLens ambitionne de devenir une sorte de :

> **Shazam de la compréhension audiovisuelle.**

Au lieu d’identifier uniquement une chanson, TVLens comprend continuellement **ce qui se passe sur l’écran**.

---

# 2. Problème

Les télévisions modernes disposent de nombreuses applications et services, mais leur intelligence reste largement limitée à l’interface et à la recommandation de contenu.

Une fois qu’un programme est lancé, le spectateur reste essentiellement passif.

Lorsqu’il veut comprendre quelque chose qu’il vient de voir, il doit généralement :

1. interrompre le programme ;
2. prendre son téléphone ;
3. retrouver le nom de la personne, du lieu ou du sujet ;
4. effectuer une recherche ;
5. reformuler lui-même le contexte ;
6. essayer de retrouver plusieurs sources si l’information est contestable.

Cette rupture est encore plus importante lorsqu’une question fait référence à quelque chose de temporel :

> « Ce qu’il vient de dire est vrai ? »

Un assistant classique ne sait pas naturellement ce que représente « ce qu’il vient de dire ».

TVLens cherche à supprimer cette friction en donnant à l’IA **le même contexte audiovisuel que le spectateur**.

---

# 3. Proposition de valeur

## Vision

> **Give your television a memory, eyes and understanding — without sending your living room to the cloud.**

TVLens apporte quatre capacités principales.

### 3.1 See

Le système comprend les éléments visuels présents à l’écran :

- personnes ;
- lieux ;
- objets ;
- textes ;
- sous-titres ;
- logos ;
- graphiques ;
- tableaux ;
- cartes ;
- œuvres ;
- produits ;
- événements visuels.

### 3.2 Hear

Le système comprend le contenu audio :

- transcription ;
- locuteurs ;
- citations ;
- chiffres ;
- noms ;
- affirmations ;
- questions ;
- concepts ;
- changements de sujet.

### 3.3 Remember

TVLens conserve une mémoire temporelle structurée du contenu récent.

Exemple :

```text
20:14:02
Topic: SpaceX

20:14:16
Speaker: Elon Musk

20:14:21
Claim:
"Starship will..."

20:14:42
Visual:
Graph showing launch cadence

20:15:03
Topic transition:
Mars colonization
```

Ainsi, une requête comme :

> « Le graphique qu’on a vu il y a deux minutes disait quoi ? »

peut être comprise sans que l’utilisateur ait besoin de fournir davantage de contexte.

### 3.4 Understand

L’assistant peut exploiter le contexte accumulé pour :

- expliquer ;
- identifier ;
- résumer ;
- rechercher ;
- comparer ;
- contextualiser ;
- vérifier une affirmation ;
- répondre aux questions de suivi.

---

# 4. Principe produit fondamental

TVLens ne doit pas être présenté comme une IA qui décide seule de ce qui est « vrai » ou « faux ».

Le produit doit privilégier :

> **Claim → Evidence → Sources → Context**

plutôt que :

> **Claim → TRUE / FALSE**

Pour une affirmation :

> « Le chômage a doublé depuis 2023. »

TVLens pourrait présenter :

**Affirmation détectée**

> Le chômage a doublé depuis 2023.

**Données trouvées**

- Source A : …
- Source B : …
- Source C : …

**Contexte**

L’évolution dépend de l’indicateur étudié, de la période considérée et de la population utilisée.

**Conclusion factuelle**

Les données disponibles montrent X, alors que l’affirmation indique Y.

L’objectif est d’augmenter la capacité de l’utilisateur à comprendre et vérifier une information, pas de remplacer son jugement.

---

# 5. Pourquoi du local

Le traitement local n’est pas seulement un choix technique.

C’est l’un des fondements du produit.

Pour fonctionner correctement, TVLens peut être amené à observer :

- l’intérieur du logement ;
- la télévision ;
- les habitudes de consommation ;
- les voix présentes dans la pièce ;
- les programmes regardés ;
- les horaires de présence ;
- les recherches de l’utilisateur ;
- les questions posées ;
- potentiellement des personnes présentes devant la télévision.

Envoyer continuellement ces informations vers plusieurs services cloud pose un problème de confidentialité évident.

L’architecture cible privilégie donc :

```text
Camera
   │
Microphone
   │
   ▼
ASUS Ascent GX10
   │
   ├── Vision
   ├── Speech
   ├── Multimodal reasoning
   ├── Temporal memory
   └── Local database
```

Par défaut, les données audiovisuelles brutes restent locales.

Les appels Internet sont réservés aux fonctionnalités qui les nécessitent réellement, par exemple la consultation de sources externes lors d’un fact-check.

---

# 6. Utilisateurs cibles

## 6.1 Spectateur curieux

Regarde :

- documentaires ;
- films ;
- conférences ;
- émissions ;
- actualités.

Besoin :

> Comprendre immédiatement ce qu’il voit sans sortir de l’expérience.

---

## 6.2 Consommateur d’actualités

Regarde :

- débats ;
- interviews ;
- chaînes d’information ;
- podcasts vidéo ;
- YouTube.

Besoin :

> Vérifier les chiffres, citations et affirmations importantes.

---

## 6.3 Étudiant / apprenant

Regarde :

- cours ;
- conférences ;
- tutoriels ;
- contenus éducatifs.

Besoin :

> Transformer une vidéo passive en expérience interactive.

---

## 6.4 Cinéphile / séries

Besoin :

- identifier un acteur ;
- retrouver un personnage ;
- rappeler un événement précédent ;
- comprendre un élément scénaristique.

TVLens devra éviter les spoilers en limitant son raisonnement au contenu déjà observé.

---

# 7. Jobs To Be Done

## JTBD 1 — Identifier

> Quand je vois quelque chose que je ne reconnais pas, je veux pouvoir demander ce que c’est sans chercher manuellement.

Exemples :

- « C’est quel monument ? »
- « C’est quelle voiture ? »
- « Qui est cet acteur ? »

---

## JTBD 2 — Expliquer

> Quand un sujet complexe est abordé, je veux une explication adaptée à mon niveau.

Exemples :

- « C’est quoi le quantitative easing ? »
- « Pourquoi cette réaction chimique fonctionne ? »
- « Explique ce qu’ils viennent de dire simplement. »

---

## JTBD 3 — Se souvenir

> Quand j’oublie un élément vu précédemment, je veux pouvoir le retrouver.

Exemples :

- « C’était qui le mec qu’on a vu avant ? »
- « Quelle ville ils ont montrée au début ? »
- « Résume-moi les dix dernières minutes. »

---

## JTBD 4 — Vérifier

> Quand quelqu’un avance une information importante, je veux rapidement voir les éléments disponibles pour la vérifier.

Exemple :

> « Ils disent que la population a baissé de 30 %. Vérifie. »

---

## JTBD 5 — Explorer

> Quand quelque chose m’intéresse, je veux pouvoir approfondir sans avoir à reformuler manuellement tout le contexte.

Exemple :

> « Dis-m’en plus sur cette entreprise. »

Le système sait automatiquement de quelle entreprise il est question.

---

# 8. Modes principaux

## 8.1 ASK

Interaction générale.

Commande :

> « Qu’est-ce qu’il vient de se passer ? »

Le système utilise :

- audio récent ;
- frames récentes ;
- mémoire ;
- transcription.

---

# 8.2 VERIFY

Fact-checking assisté.

Pipeline :

```text
Audio
 ↓
Speech-to-text
 ↓
Claim extraction
 ↓
Claim normalization
 ↓
Search
 ↓
Source retrieval
 ↓
Evidence analysis
 ↓
Result
```

---

# 8.3 IDENTIFY

Identification contextuelle.

Possibilités :

- personnalité ;
- acteur ;
- monument ;
- animal ;
- produit ;
- véhicule ;
- œuvre ;
- lieu.

---

# 8.4 EXPLAIN

Explication du contenu.

Exemples :

> « Explique-moi ce graphique. »

> « Ça veut dire quoi ce terme ? »

---

# 8.5 RECAP

Résumé temporel.

Exemples :

> « Résume-moi ce qui s’est passé depuis que je suis parti. »

> « Résume les cinq dernières minutes. »

---

# 9. Expérience utilisateur

## Interaction principale MVP

Le téléviseur continue à afficher normalement le contenu.

L’utilisateur dispose d’un **second screen** :

- smartphone ;
- tablette ;
- navigateur ;
- laptop.

Interface :

```text
┌──────────────────────────────────┐
│ TVLens                           │
│                                  │
│ ● Watching                       │
│                                  │
│ Topic                            │
│ SpaceX / Starship                │
│                                  │
│ Current speaker                  │
│ Elon Musk                        │
│                                  │
│ ──────────────────────────────── │
│                                  │
│ Ask anything...                  │
│                                  │
│ [ Verify last claim ]            │
│ [ Explain ] [ Recap ]            │
└──────────────────────────────────┘
```

---

# 10. Ambient UI

TVLens ne doit pas nécessiter une interaction permanente.

Pendant la lecture, le système peut afficher discrètement :

```text
3 claims detected

2 people identified

1 topic available for context
```

L’utilisateur décide ensuite d’ouvrir les informations.

Principe :

> **AI should observe silently and appear only when useful.**

---

# 11. Architecture MVP

```text
                    ┌───────────────┐
                    │      TV       │
                    └───────┬───────┘
                            │
                ┌───────────┴───────────┐
                │                       │
             Camera                    Mic
                │                       │
                └──────────┬────────────┘
                           │
                           ▼
               ┌────────────────────┐
               │ ASUS ASCENT GX10   │
               └────────────────────┘
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
       Vision          Audio/STT       OCR/Subtitles
          │                │                 │
          └────────────────┼─────────────────┘
                           ▼
                 Multimodal Context
                           │
                           ▼
                  Temporal Memory
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
           ASK          VERIFY        RECAP
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                     Web interface
```

---

# 12. Capture vidéo

Pour le MVP, TVLens utilise une caméra orientée vers la télévision.

Avantages :

- indépendant du modèle de TV ;
- indépendant du système d’exploitation ;
- fonctionne avec Netflix ;
- fonctionne avec YouTube ;
- fonctionne avec une box ;
- fonctionne avec une console ;
- fonctionne avec la TNT ;
- pas d’intégration spécifique par service.

La calibration initiale doit permettre de détecter automatiquement les quatre coins de l’écran et de redresser l’image.

Pipeline :

```text
camera frame
     ↓
TV detection
     ↓
perspective correction
     ↓
screen crop
     ↓
VLM / OCR
```

---

# 13. Capture audio

MVP :

microphone USB ou micro de la caméra.

Pipeline :

```text
Audio stream
    ↓
Voice Activity Detection
    ↓
Speech-to-text
    ↓
timestamped transcript
    ↓
speaker / topic / claim detection
```

L’audio doit être horodaté afin de pouvoir le relier aux images correspondantes.

---

# 14. Temporal Context Engine

Il s’agit probablement de la brique différenciante principale de TVLens.

TVLens ne doit pas envoyer indépendamment chaque frame au modèle.

Il doit construire progressivement une représentation compacte du programme.

Exemple :

```json
{
  "timestamp": "20:14:42",
  "topic": "electric vehicles",
  "speaker": "Person A",
  "entities": [
    "Tesla",
    "battery manufacturing"
  ],
  "claims": [
    {
      "text": "Battery prices dropped by 80%",
      "timestamp": "20:14:31"
    }
  ],
  "visual_context": {
    "type": "chart",
    "title": "Average battery cost"
  }
}
```

La mémoire permet ensuite de reconstruire le contexte utile sans réinjecter plusieurs minutes de vidéo brute dans le modèle.

---

# 15. Niveaux de mémoire

## L0 — Raw buffer

Quelques secondes de :

- frames ;
- audio.

Durée MVP :

~30 secondes.

---

## L1 — Transcript

Historique des dialogues.

Durée possible :

30 à 60 minutes.

---

## L2 — Events

Événements structurés :

```text
person appears
topic changes
new place
important graph
claim detected
```

---

## L3 — Semantic summary

Résumé évolutif :

```text
The discussion concerns...
Person A argues...
Person B disagrees because...
```

---

# 16. Claim detection

Le système détecte en priorité les affirmations vérifiables :

- statistiques ;
- dates ;
- nombres ;
- records ;
- faits historiques ;
- affirmations scientifiques ;
- déclarations attribuées ;
- résultats économiques.

Il doit distinguer autant que possible :

### Fait vérifiable

> « La population est de 5 millions. »

### Opinion

> « Cette politique est mauvaise. »

### Prédiction

> « Le marché va exploser l’année prochaine. »

### Expression subjective

> « C’est le meilleur film de l’année. »

Seules les affirmations pouvant être confrontées à des sources doivent déclencher le pipeline de vérification par défaut.

---

# 17. Evidence Engine

Lorsque l’utilisateur demande une vérification :

```text
claim
 ↓
normalize
 ↓
