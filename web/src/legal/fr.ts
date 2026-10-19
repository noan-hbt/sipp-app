import type { LegalPage, LegalPageKey } from './types'

/** Textes légaux en français (la version de référence). `{name}`, `{status}`, `{address}`, `{siren}`, `{email}`, `{mediator}` viennent de editor.ts. */
export const LEGAL_FR: Record<LegalPageKey, LegalPage> = {
  mentions: {
    title: 'Mentions légales',
    sections: [
      {
        title: 'Éditeur',
        body: [
          'Sipp est édité par {name}, {status}.',
          'Adresse : {address}. SIREN : {siren}.',
          'Contact : {email}. Directeur ou directrice de la publication : {name}.',
        ],
      },
      {
        title: 'Hébergement',
        body: ['L’application et ses données sont hébergées par Railway Corporation, San Francisco, Californie, États-Unis (railway.com).'],
      },
      {
        title: 'Propriété intellectuelle',
        body: [
          'Le nom Sipp, l’application, ses illustrations, sa mascotte et ses textes d’interface appartiennent à l’éditeur. Toute reproduction sans accord écrit est interdite.',
          'Les leçons sont rédigées par une intelligence artificielle à partir de ta demande. Tu peux les utiliser librement pour ton apprentissage personnel.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Politique de confidentialité',
    intro: 'Cette page explique, simplement, quelles données Sipp utilise, pourquoi, avec qui, et comment garder la main dessus.',
    sections: [
      {
        title: 'Qui est responsable',
        body: ['Le responsable du traitement est {name} ({address}). Pour toute question sur tes données : {email}.'],
      },
      {
        title: 'Ce que nous collectons',
        body: [
          'Ton compte : ton adresse email et ton mot de passe, que nous ne stockons que sous forme chiffrée (hachée) et que personne ne peut relire.',
          'Ce que tu veux apprendre : tes demandes, le profil d’apprentissage et les parcours que Sipp en tire.',
          'Ta progression : leçons suivies, réponses aux exercices, étoiles, série, révisions, ainsi que les passages que tu gardes dans ton carnet, tes avis et tes signalements sur les leçons.',
          'Tes réglages : objectif du jour, heure de rappel, fuseau horaire, langue, et, si tu actives les rappels, l’adresse technique de notification de ton appareil.',
          'Ton abonnement : ton offre et son état. Le paiement est traité par Paddle : nous ne voyons jamais ta carte bancaire.',
          'Des données techniques : erreurs de l’application (sans ton email ni le contenu de tes réponses) et journaux du serveur.',
          'Des statistiques d’usage (écrans vus, actions principales), uniquement si tu l’acceptes.',
        ],
      },
      {
        title: 'Pourquoi, et sur quelle base',
        body: [
          'Fournir le service (créer tes parcours, sauver ta progression, te rappeler ta leçon) : c’est l’exécution du contrat que tu acceptes en créant ton compte.',
          'Gérer ton abonnement et la facturation : contrat et obligations légales.',
          'Sécuriser l’application et éviter les abus (limites d’usage, détection d’erreurs) : notre intérêt légitime.',
          'Mesurer l’usage pour améliorer Sipp : ton consentement, que tu peux retirer à tout moment dans ton profil.',
          'Les rappels quotidiens : ton accord, donné en activant les notifications, et révocable dans ton profil ou dans les réglages de ton appareil.',
        ],
      },
      {
        title: 'Intelligence artificielle',
        body: [
          'Pour écrire tes leçons et répondre à tes questions pendant une leçon, le texte de ta demande et le contenu du cours sont envoyés, via le service OpenRouter, à des fournisseurs de modèles d’intelligence artificielle. Ton email et ton identité ne leur sont jamais transmis.',
          'Évite d’écrire dans tes demandes des informations personnelles dont tu n’as pas besoin pour apprendre (nom, santé, etc.).',
          'Les leçons sont générées automatiquement et peuvent contenir des erreurs : elles ne remplacent pas l’avis d’un professionnel (santé, droit, finances).',
        ],
      },
      {
        title: 'Avec qui nous les partageons',
        body: [
          'Uniquement avec les prestataires qui font tourner Sipp, chacun pour sa mission et sous contrat :',
          'Railway (hébergement de l’application et de la base de données, États-Unis).',
          'OpenRouter et les fournisseurs de modèles qu’il sollicite (génération des leçons, États-Unis et autres pays).',
          'Paddle (vente des abonnements et paiement, en tant que revendeur officiel).',
          'Sentry (suivi des erreurs, sans données d’identification).',
          'PostHog (statistiques d’usage, hébergées dans l’Union européenne, seulement avec ton accord).',
          'Certains de ces prestataires sont situés hors de l’Union européenne. Les transferts sont encadrés par les garanties prévues par le RGPD (clauses contractuelles types de la Commission européenne ou certification Data Privacy Framework). Nous ne vendons jamais tes données.',
        ],
      },
      {
        title: 'Combien de temps',
        body: [
          'Tes données sont conservées tant que ton compte existe. Quand tu le supprimes, elles sont effacées immédiatement et définitivement de notre base.',
          'Restent seulement ce que la loi impose de garder, comme les factures, conservées par Paddle pendant la durée légale, et les journaux techniques de l’hébergeur, conservés pour une durée limitée.',
        ],
      },
      {
        title: 'Tes droits',
        body: [
          'Tu peux à tout moment accéder à tes données, les corriger, les effacer, les récupérer dans un format lisible, t’opposer à un traitement ou en demander la limitation.',
          'Directement dans ton profil : « Exporter mes données » et « Supprimer mon compte ». Pour le reste, écris à {email}. Nous répondons sous un mois.',
          'Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (cnil.fr).',
        ],
      },
      {
        title: 'Stockage sur ton appareil',
        body: [
          'Sipp garde sur ton appareil ce qui est nécessaire pour fonctionner : ta session de connexion, tes préférences (thème, son, langue) et une copie de tes parcours pour l’utilisation hors ligne. Cela ne demande pas ton accord.',
          'Les statistiques d’usage ne sont activées que si tu les acceptes, dans le bandeau ou dans ton profil.',
        ],
      },
      {
        title: 'Âge minimum',
        body: ['Sipp est réservé aux personnes de 15 ans et plus.'],
      },
      {
        title: 'Modifications',
        body: ['Nous pouvons faire évoluer cette politique. En cas de changement important, nous te prévenons dans l’application.'],
      },
    ],
  },

  terms: {
    title: 'Conditions d’utilisation et de vente',
    intro: 'Ces conditions encadrent l’utilisation de Sipp et ses abonnements. En créant ton compte, tu les acceptes.',
    sections: [
      {
        title: 'Le service',
        body: [
          'Sipp crée des parcours de leçons courtes sur le sujet de ton choix, rédigés par une intelligence artificielle, et t’aide à les suivre (révisions, rappels, carnet).',
          'Les leçons sont générées automatiquement : malgré nos contrôles, elles peuvent contenir des erreurs ou des simplifications. Elles servent à apprendre et ne constituent pas un conseil professionnel, notamment médical, juridique ou financier. Le bouton « Signaler un problème » de chaque leçon nous aide à les corriger.',
        ],
      },
      {
        title: 'Ton compte',
        body: [
          'Il faut avoir au moins 15 ans pour créer un compte. Tu t’engages à donner une adresse email valide et à garder ton mot de passe secret.',
          'Tu peux supprimer ton compte à tout moment depuis ton profil.',
        ],
      },
      {
        title: 'Utilisation acceptable',
        body: [
          'Tu t’engages à ne pas utiliser Sipp pour obtenir de l’aide à nuire à toi-même ou à autrui, pour produire des contenus illégaux, ni pour contourner les limites du service (création automatisée de comptes, utilisation par des programmes, revente).',
          'En cas d’abus manifeste, nous pouvons suspendre l’accès au compte concerné, après t’avoir prévenu sauf urgence.',
        ],
      },
      {
        title: 'Contenus',
        body: [
          'Ce que tu écris (demandes, notes) reste à toi. Tu nous autorises à le traiter uniquement pour faire fonctionner le service.',
          'Tu peux utiliser librement les leçons générées pour ton apprentissage personnel. L’application elle-même (code, design, illustrations, marque) reste la propriété de l’éditeur.',
        ],
      },
      {
        title: 'Offres et prix',
        body: [
          'L’offre gratuite donne accès à un nombre limité de parcours, plus courts. Les offres payantes (Essentiel, Plus) débloquent des parcours complets et des fonctionnalités supplémentaires, détaillées sur la page des offres.',
          'Les prix sont affichés toutes taxes comprises avant le paiement, au mois ou à l’année.',
          'Les abonnements sont vendus par Paddle.com, notre revendeur officiel, qui gère le paiement, la facturation et la TVA. Les conditions d’achat de Paddle s’appliquent au paiement.',
        ],
      },
      {
        title: 'Essai gratuit',
        body: ['L’essai de l’offre Essentiel dure 7 jours et ne demande aucune carte bancaire. À la fin, tu repasses automatiquement sur l’offre gratuite, sans rien payer, sauf si tu choisis de t’abonner.'],
      },
      {
        title: 'Renouvellement et résiliation',
        body: [
          'Un abonnement se renouvelle automatiquement à la fin de chaque période (mois ou année), au prix en vigueur dont tu es informé à l’avance.',
          'Tu peux le résilier à tout moment depuis ton profil (« Gérer » puis « Résilier »). La résiliation prend effet à la fin de la période déjà payée : tu gardes ton accès jusque-là.',
        ],
      },
      {
        title: 'Droit de rétractation et remboursement',
        body: [
          'Tu disposes d’un délai de 14 jours après ton abonnement pour te rétracter. Au moment de payer, tu peux demander à accéder tout de suite à l’abonnement : tu reconnais alors que le service commence avant la fin de ce délai.',
          'Dans tous les cas, si tu n’es pas satisfait, tu peux demander le remboursement de ton premier paiement dans les 14 jours, en écrivant à {email} ou via le reçu Paddle.',
        ],
      },
      {
        title: 'Disponibilité et responsabilité',
        body: [
          'Nous faisons notre possible pour que Sipp soit disponible et fiable, sans pouvoir garantir une absence totale d’interruption ou d’erreur. Le service peut évoluer : fonctionnalités, offres et limites peuvent changer, et nous te prévenons de tout changement important.',
          'Notre responsabilité ne peut être engagée pour une décision prise uniquement sur la base d’une leçon générée.',
        ],
      },
      {
        title: 'Données personnelles',
        body: ['Leur traitement est décrit dans la politique de confidentialité.'],
      },
      {
        title: 'Litiges',
        body: [
          'Ces conditions sont soumises au droit français. En cas de souci, écris-nous d’abord à {email} : nous cherchons toujours une solution amiable.',
          'Tu peux aussi recourir gratuitement au médiateur de la consommation : {mediator}.',
        ],
      },
    ],
  },
}
