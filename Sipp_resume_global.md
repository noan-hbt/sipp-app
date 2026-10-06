# Sipp --- Résumé global

## Le concept

**Sipp est une application d'apprentissage personnalisé en
micro-leçons.**

L'utilisateur indique ce qu'il veut apprendre, avec éventuellement son
niveau, ses connaissances actuelles et son objectif. Sipp transforme
cette intention en **parcours d'apprentissage structuré et
personnalisé**, puis fait progresser l'utilisateur à travers de petites
leçons interactives d'environ 5 minutes.

``` text
Je veux apprendre X
        ↓
Sipp comprend mon objectif
        ↓
construit le chemin nécessaire
        ↓
m’enseigne progressivement
        ↓
vérifie ma compréhension
        ↓
s’appuie sur ce que j’ai déjà appris
```

L'idée n'est donc pas de faire « un chatbot qui génère un cours », mais
un système qui construit et dispense progressivement un parcours adapté
à l'apprenant.

## Structure d'un Sip

``` text
SIP
│
├── Module 1
│   ├── Leçon 1
│   ├── Leçon 2
│   └── Leçon 3
│
├── Module 2
│   └── ...
│
└── Module N
```

Le nombre de modules et de leçons est **dynamique**. Les limites
actuelles (`12 modules`, `15 leçons/module`) sont des garde-fous
techniques et non des objectifs à remplir.

## Pipeline de génération

``` text
INPUT UTILISATEUR
       │
       ▼
1. INTERPRETATION
       │
       ▼
Learning Profile
       │
       ▼
2. CURRICULUM
       │
       ▼
Modules
       │
       ▼
3. MAPPING
       │
       ▼
Leçons + dépendances + concepts
       │
       ▼
4. PLANNING
       │
       ▼
Stratégie pédagogique
       │
       ▼
5. WRITING
       │
       ▼
Blocs pédagogiques interactifs
       │
       ▼
6. REVIEW
       │
       ▼
LEÇON FINALE
```

### 1. Interpretation

Transforme l'input libre en profil d'apprentissage structuré : sujet,
niveau actuel, niveau cible, objectifs, connaissances préalables,
profondeur souhaitée, langue et hypothèses nécessaires.

Le niveau peut être multidimensionnel : un utilisateur peut par exemple
être avancé en Python mais débutant sur les mécanismes d'attention.

### 2. Curriculum

Définit la colonne vertébrale intellectuelle du Sip :

> Qu'est-ce que cette personne doit apprendre, et dans quel ordre, pour
> atteindre son objectif ?

Il produit les modules, leur rôle et leurs objectifs. C'est l'une des
étapes où la qualité du raisonnement du modèle compte le plus.

### 3. Mapping

Transforme chaque module en leçons. Chaque leçon possède notamment :

-   un titre ;
-   un objectif ;
-   des prérequis ;
-   les concepts à enseigner.

Les dépendances peuvent traverser les modules et forment progressivement
un graphe implicite de connaissances.

### 4. Planning

Prépare la pédagogie d'une leçon avant sa rédaction : objectif précis,
concepts, ordre pédagogique, intuition, exemples, applications, idées
reçues et contrôles de compréhension.

``` text
Planner = quoi enseigner et comment l’enseigner
Writer  = matérialiser cette stratégie
```

### 5. Writing

Transforme le plan en expérience d'apprentissage. Le Writer ne produit
plus un simple article ou un gros Markdown, mais une séquence de
**blocks pédagogiques structurés**.

``` text
text
 ↓
scenario
 ↓
concept
 ↓
comparison
 ↓
misconception
 ↓
question
 ↓
application
 ↓
question
 ↓
recap
```

Sipp ne génère donc pas simplement « un texte de cinq minutes », mais
**une expérience d'apprentissage de cinq minutes**.

### 6. Review

Contrôle notamment :

-   l'exactitude factuelle ;
-   les concepts manquants ;
-   les contradictions ;
-   les répétitions inutiles ;
-   les concepts utilisés avant leur introduction ;
-   la difficulté ;
-   les exemples trompeurs ;
-   l'atteinte de l'objectif ;
-   la densité pédagogique ;
-   les informations hors objectif.

Une seule révision maximum est prévue initialement. Les erreurs
structurelles simples doivent être détectées par du code déterministe
plutôt que par un LLM.

## Les blocks Sipp

La V1 repose sur environ **12 primitives pédagogiques**.

### Contenu

**`text`** --- Explication, introduction ou transition courte. Affichage
très épuré.

**`concept`** --- Introduction explicite d'une notion. Carte
visuellement identifiable « Nouveau concept ».

**`example`** --- Exemple concret court. Carte « Exemple ».

**`scenario`** --- Situation immersive avec personnage ou contexte,
pouvant être interrompue par une interaction.

**`analogy`** --- Construction d'une intuition en mettant deux choses en
parallèle.

**`comparison`** --- Comparaison de plusieurs concepts. Sur mobile :
cartes ou swipe plutôt qu'un tableau.

**`sequence`** --- Processus ordonné, représenté par une timeline
verticale.

**`cause_effect`** --- Relation causale, par exemple :

``` text
Hausse des taux
      ↓
Crédit plus cher
      ↓
Moins d’emprunts
      ↓
Demande ↓
      ↓
Pression inflationniste ↓
```

### Interactions

**`misconception`** --- Présente une croyance potentiellement fausse
puis sa correction. Peut être rendue comme une interaction « Vrai ou
faux ? ».

**`question`** --- Vérification active de compréhension.

Types V1 envisagés :

-   `single_choice`
-   `multiple_choice`
-   `true_false`
-   `open`

Plus tard : `ordering`, `matching`, `fill_blank`.

Une question doit fournir une explication après la réponse, pas
seulement un état correct/incorrect.

**`application`** --- Demande à l'utilisateur d'appliquer
personnellement ce qu'il vient d'apprendre. Il n'y a pas nécessairement
une bonne réponse et la saisie peut rester facultative.

### Conclusion

**`recap`** --- Consolide les principaux apprentissages de la leçon et
peut afficher les concepts acquis et la progression.

## Block ≠ écran

Distinction fondamentale :

``` text
block = unité pédagogique
screen = unité d’affichage
```

Le LLM ne génère pas directement les écrans.

``` text
LLM
 ↓
pedagogical blocks
 ↓
Sipp Renderer
 ↓
screens / cartes / animations / interactions
```

Ainsi, un `concept` peut occuper plusieurs écrans, un `comparison`
devenir plusieurs cartes swipables et une `question` produire un écran
de question puis un écran de feedback.

Le Writer reste responsable de la **pédagogie** ; le renderer reste
responsable de la **présentation**.

## Mémoire pédagogique

Chaque leçon conserve également des métadonnées comme :

``` json
{
  "summary": "...",
  "concepts_taught": [...]
}
```

Elles servent à maintenir la continuité :

``` text
Leçon terminée
      ↓
summary + concepts_taught
      ↓
Knowledge State
      ↓
Planner de la prochaine leçon
      ↓
connaissance de ce qui a déjà été enseigné
```

Le contexte d'une nouvelle génération peut combiner curriculum global,
module actuel, profil d'apprentissage, dernières leçons complètes,
résumés plus anciens et concepts déjà introduits.

## Répartition envisagée des modèles

``` text
Interpretation  → GPT-6 Luna
Curriculum      → Claude Opus 5.5
Mapping         → GPT-6.1 Sol
Planning        → GPT-6 Luna
Writing         → GPT-6 Luna
Review          → GPT-6 Luna
```

Une escalade conditionnelle vers GPT-6.1 Sol peut être utilisée pour les
cas particulièrement difficiles.

Principe général :

> Les gros modèles conçoivent surtout la structure intellectuelle ; les
> petits modèles exécutent les tâches fortement contraintes et
> produisent le volume.

## Configuration actuelle

Principaux garde-fous :

``` text
max_modules             = 12
max_lessons_per_module  = 15
lesson_minutes          ≈ 5
max_revisions           = 1
```

Les maxima ne doivent jamais devenir des objectifs de remplissage. La
densité pédagogique prime sur une longueur artificiellement imposée.

## Expérience produit

Sipp est pensé **mobile-first**.

Pour le MVP, une PWA peut fournir une expérience installable sur l'écran
d'accueil sans nécessiter immédiatement une application native
distribuée via l'App Store.

Boucle principale :

``` text
Mes Sips
   ↓
Roadmap du Sip
   ↓
Module
   ↓
Leçon ~5 min
   ↓
blocks interactifs
   ↓
questions
   ↓
application
   ↓
recap
   ↓
progression
   ↓
prochaine leçon
```

## Positionnement

Sipp se situe entre :

-   un professeur particulier génératif ;
-   un parcours de compétences ;
-   une application de micro-learning ;
-   une expérience interactive proche de la philosophie de Duolingo,
    applicable à pratiquement n'importe quel domaine de connaissance.

La valeur principale n'est pas simplement la génération de contenu.

Le cœur du produit est sa capacité à répondre à la question :

> **Pour cette personne, qui sait actuellement X et veut atteindre Y,
> quel est le meilleur chemin d'apprentissage, dans quel ordre faut-il
> introduire les concepts, et comment les enseigner efficacement en
> quelques minutes à la fois ?**

## Proposition de valeur

> **Dis-moi ce que tu veux savoir. Sipp construit le chemin et te
> l'apprend, cinq minutes à la fois.**

L'objectif du MVP est désormais de faire fonctionner cette boucle de
bout en bout dans une vraie interface mobile, de l'utiliser réellement
au quotidien, puis d'améliorer le produit à partir des problèmes
observés à l'usage.
