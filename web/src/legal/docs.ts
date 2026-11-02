/**
 * The legal pages, in French (the version that prevails) and English. A draft written for Sipp as it
 * works today: have it read by a lawyer before launch, and update `LEGAL_UPDATED` on every change.
 */
import { COMPANY as C, HOST as H } from './company'

export type LegalSlug = 'terms' | 'privacy' | 'refunds' | 'notice'
export interface LegalDoc {
  title: string
  intro?: string
  sections: { title: string; body: string[] }[]
}
export const LEGAL_SLUGS: LegalSlug[] = ['terms', 'privacy', 'refunds', 'notice']

const PRICES_FR = 'Essentiel : 5,99 € par mois ou 59,90 € par an. Plus : 12,99 € par mois ou 129,90 € par an. Prix TTC pour la France.'
const PRICES_EN = 'Essentiel: €5.99 a month or €59.90 a year. Plus: €12.99 a month or €129.90 a year. Prices include French VAT.'

export const fr: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: 'Conditions générales d’utilisation et de vente',
    intro: `Ces conditions encadrent l’utilisation de Sipp, édité par ${C.name}. En créant un compte, tu les acceptes.`,
    sections: [
      {
        title: '1. Le service',
        body: [
          'Sipp est une application d’apprentissage : tu indiques ce que tu veux apprendre, et Sipp prépare un parcours de leçons courtes et interactives, écrites avec l’aide de modèles d’intelligence artificielle.',
          'Sipp est accessible depuis un navigateur et peut être installé sur l’écran d’accueil d’un téléphone ou d’un ordinateur.',
        ],
      },
      {
        title: '2. Ton compte',
        body: [
          'Il faut avoir au moins 15 ans pour créer un compte. Une adresse email valide et un mot de passe d’au moins 8 caractères sont demandés.',
          'Tu es responsable de la confidentialité de ton mot de passe. Si tu penses qu’il a été découvert, change-le depuis ton profil ou avec « Mot de passe oublié ».',
          'Tu peux exporter tes données et supprimer ton compte à tout moment depuis ton profil. La suppression est définitive.',
        ],
      },
      {
        title: '3. Contenus écrits par l’IA',
        body: [
          'Les leçons sont écrites automatiquement par des modèles d’intelligence artificielle, puis relues automatiquement. Malgré ces contrôles, elles peuvent contenir des erreurs ou des imprécisions.',
          'Sipp sert à apprendre et à comprendre : ce n’est pas un avis médical, juridique, financier ou professionnel. Pour une décision importante, consulte une personne qualifiée.',
          'Tu peux signaler une erreur depuis chaque leçon : on s’en sert pour améliorer Sipp.',
          'Sipp refuse certains sujets (par exemple ce qui peut mettre en danger une personne). Ce refus n’est pas une faute de notre part.',
        ],
      },
      {
        title: '4. Ce que tu écris',
        body: [
          'Tu restes propriétaire de ce que tu écris dans Sipp (tes demandes, réponses et notes). Tu nous autorises à le traiter uniquement pour faire fonctionner le service, comme décrit dans la politique de confidentialité.',
          'Tu t’engages à ne pas utiliser Sipp pour obtenir des contenus illégaux, haineux ou dangereux, ni pour perturber le service (envois automatisés, contournement des limites, tentative d’intrusion).',
          'Les leçons générées pour toi sont à ton usage personnel. Tu peux les partager à titre non commercial.',
        ],
      },
      {
        title: '5. Offres et prix',
        body: [
          'L’offre Gratuite permet de découvrir Sipp avec des parcours courts. Les offres payantes, Essentiel et Plus, ajoutent des parcours complets, plus de Sips par mois et des fonctionnalités comme l’écoute audio et les quiz de module. Le détail de chaque offre est affiché sur la page Offres.',
          PRICES_FR,
          'Un essai gratuit de l’offre Essentiel, sans carte bancaire, peut être proposé une seule fois par compte. À sa fin, le compte repasse en Gratuit, sans aucun prélèvement.',
          'Nous pouvons faire évoluer les prix. Un changement de prix ne s’applique jamais à la période en cours, et tu es prévenu·e avant le renouvellement concerné.',
        ],
      },
      {
        title: '6. Paiement : Paddle, notre revendeur',
        body: [
          'Les abonnements sont vendus par Paddle.com Market Limited, qui agit comme revendeur officiel (« Merchant of Record ») : c’est Paddle qui encaisse le paiement, émet la facture et gère la TVA. Les conditions d’achat de Paddle (paddle.com/legal/checkout-buyer-terms) s’appliquent au paiement.',
          'L’abonnement est payé d’avance et se renouvelle automatiquement chaque mois ou chaque année, selon la formule choisie.',
          'Si un paiement échoue, Paddle réessaie pendant quelques jours, durant lesquels ton accès est conservé. Sans paiement, le compte repasse en Gratuit. Aucun Sip n’est supprimé.',
        ],
      },
      {
        title: '7. Résiliation',
        body: [
          'Tu peux résilier à tout moment depuis ton profil (« Résilier »), en quelques clics. L’accès payant reste ouvert jusqu’à la fin de la période déjà payée, puis le compte repasse en Gratuit.',
          'Nous pouvons suspendre ou fermer un compte qui enfreint gravement ces conditions, après t’avoir prévenu·e sauf urgence.',
        ],
      },
      {
        title: '8. Droit de rétractation',
        body: [
          'En tant que consommateur dans l’Union européenne, tu disposes d’un délai de 14 jours pour te rétracter d’un achat en ligne. Comme l’abonnement donne accès tout de suite à un contenu numérique, tu demandes au moment du paiement que l’accès commence immédiatement et tu reconnais perdre ce droit de rétractation.',
          'Nous appliquons malgré tout la politique de remboursement décrite sur la page « Remboursement ».',
        ],
      },
      {
        title: '9. Disponibilité et responsabilité',
        body: [
          'Nous faisons notre possible pour que Sipp soit disponible et fiable, sans pouvoir le garantir en permanence (maintenance, panne d’un prestataire, coupure réseau).',
          'Notre responsabilité ne peut pas être engagée pour une décision prise uniquement sur la base d’une leçon, ni pour un dommage indirect. Rien dans ces conditions ne limite les droits que la loi te garantit en tant que consommateur.',
        ],
      },
      {
        title: '10. Modifications',
        body: [
          'Ces conditions peuvent évoluer avec le service. En cas de changement important, tu en es informé·e dans l’app ou par email avant son entrée en vigueur. Si tu n’es pas d’accord, tu peux résilier et supprimer ton compte.',
        ],
      },
      {
        title: '11. Litiges',
        body: [
          `Ces conditions sont régies par le droit français. En cas de difficulté, écris-nous d’abord à ${C.email} : on cherchera une solution ensemble.`,
          'Tu peux aussi recourir gratuitement à un médiateur de la consommation, ou à la plateforme européenne de règlement des litiges en ligne (ec.europa.eu/consumers/odr). À défaut d’accord, les tribunaux compétents sont ceux prévus par la loi ; pour un consommateur, ceux de son domicile restent possibles.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    intro: `Cette page explique quelles données Sipp utilise, pourquoi, et comment tu gardes la main dessus. Le responsable du traitement est ${C.name}, ${C.address}. Contact : ${C.email}.`,
    sections: [
      {
        title: 'Les données que nous utilisons',
        body: [
          'Ton compte : adresse email, mot de passe (stocké uniquement sous forme chiffrée irréversible, jamais en clair), langue, fuseau horaire, date d’accord pour l’IA.',
          'Ton apprentissage : ce que tu demandes à apprendre, les parcours et leçons écrits pour toi, tes réponses, étoiles, séries, notes, notions à revoir, signalements et retours sur les leçons.',
          'Tes réglages : objectif quotidien, heure de rappel et, si tu actives les notifications, l’adresse technique de ton navigateur pour les recevoir.',
          'Ton abonnement : offre, statut et dates. Les données bancaires sont saisies chez Paddle : nous n’y avons jamais accès.',
          'Données techniques : journaux du serveur, erreurs, et statistiques d’usage (pages vues, étapes du parcours), sans le texte de tes leçons ni de tes réponses.',
        ],
      },
      {
        title: 'Pourquoi, et sur quelle base',
        body: [
          'Faire fonctionner Sipp (créer ton compte, écrire et afficher tes leçons, suivre ta progression, gérer ton abonnement) : exécution du contrat que tu acceptes en t’inscrivant.',
          'Envoyer tes demandes aux modèles d’IA : avec ton accord, recueilli avant ta première demande.',
          'Les emails de compte (bienvenue, mot de passe) : exécution du contrat. L’email de relance après quelques jours sans leçon : intérêt légitime à t’aider à garder ton habitude ; tu peux le désactiver en un clic depuis l’email ou ton profil.',
          'Sécurité, prévention des abus, mesure d’audience et correction des erreurs : intérêt légitime à fournir un service fiable.',
          'Facturation et comptabilité : obligation légale.',
        ],
      },
      {
        title: 'Qui reçoit tes données',
        body: [
          'Seule l’équipe de Sipp y a accès, et nous ne vendons jamais tes données. Nous faisons appel à ces prestataires, chacun pour sa seule mission :',
          `${H.name} (hébergement du service et de la base de données, États-Unis).`,
          'OpenRouter, qui transmet tes demandes et questions aux modèles d’OpenAI et d’Anthropic pour écrire tes leçons (États-Unis). Ton email et ton identité ne leur sont pas transmis.',
          'Paddle (paiement, facturation, TVA ; Royaume-Uni et Union européenne).',
          'Resend (envoi des emails, États-Unis).',
          'PostHog (statistiques d’usage, hébergé dans l’Union européenne) et Sentry (suivi des erreurs) : tu y es identifié·e par un numéro, jamais par ton email.',
          'Le service de notifications de ton navigateur (Apple, Google ou Mozilla), si tu actives les rappels.',
          'Les transferts hors de l’Union européenne sont encadrés par les clauses contractuelles types de la Commission européenne ou le Data Privacy Framework.',
        ],
      },
      {
        title: 'Combien de temps',
        body: [
          'Tes données de compte et d’apprentissage sont conservées tant que ton compte existe, et effacées quand tu le supprimes.',
          'Les liens de réinitialisation du mot de passe expirent au bout d’une heure.',
          'Les données de facturation sont conservées 10 ans, comme l’exige la loi, détachées de ton compte s’il est supprimé.',
          'Les journaux techniques sont conservés au plus 12 mois.',
        ],
      },
      {
        title: 'Tes droits',
        body: [
          'Tu peux accéder à tes données, les corriger, les effacer, en limiter l’usage, t’opposer à certains traitements et les récupérer dans un format lisible. Deux de ces droits sont directement dans ton profil : « Exporter mes données » et « Supprimer mon compte ».',
          `Pour toute autre demande, écris à ${C.email}. Nous répondons sous un mois.`,
          'Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (cnil.fr).',
        ],
      },
      {
        title: 'Stockage sur ton appareil',
        body: [
          'Sipp n’utilise aucun cookie publicitaire. L’app garde sur ton appareil (stockage local du navigateur) ta session, tes préférences (thème, sons, langue), une copie des leçons pour les lire hors connexion et l’identifiant des statistiques d’usage.',
        ],
      },
      {
        title: 'Mineurs',
        body: ['Sipp est réservé aux personnes de 15 ans et plus.'],
      },
    ],
  },
  refunds: {
    title: 'Remboursement',
    intro: 'Nous voulons que tu paies Sipp parce qu’il t’est utile. Voici comment fonctionnent les remboursements.',
    sections: [
      {
        title: 'Premier paiement : 14 jours pour changer d’avis',
        body: [
          `Si Sipp ne te convient pas, écris-nous dans les 14 jours qui suivent le premier paiement d’un abonnement, à ${C.email} depuis l’adresse de ton compte : nous le remboursons en entier, sans avoir à te justifier. L’abonnement est alors résilié.`,
        ],
      },
      {
        title: 'Renouvellements',
        body: [
          'Les renouvellements ne sont pas remboursés, mais tu peux résilier à tout moment depuis ton profil : aucun nouveau prélèvement n’aura lieu, et l’accès reste ouvert jusqu’à la fin de la période déjà payée.',
          'Si tu as oublié de résilier un abonnement annuel, écris-nous dans les 7 jours qui suivent son renouvellement si tu n’as pas utilisé Sipp depuis : nous regarderons ta demande avec bienveillance.',
        ],
      },
      {
        title: 'Problème technique',
        body: [
          'Si un problème de notre côté t’a empêché·e d’utiliser ce que tu as payé, écris-nous : nous remboursons la période concernée.',
        ],
      },
      {
        title: 'Comment ça se passe',
        body: [
          'Le remboursement est versé par Paddle, notre revendeur, sur le moyen de paiement utilisé, en général sous 5 à 10 jours ouvrés. Tu peux aussi faire ta demande directement auprès de Paddle via le lien présent dans ton email de facture (paddle.net).',
        ],
      },
    ],
  },
  notice: {
    title: 'Mentions légales',
    sections: [
      {
        title: 'Éditeur',
        body: [C.name, C.form, C.address, C.registration, C.vat, `Contact : ${C.email}`, `Directeur·rice de la publication : ${C.publisher}`],
      },
      {
        title: 'Hébergement',
        body: [H.name, H.address, H.website],
      },
      {
        title: 'Propriété intellectuelle',
        body: [
          'Le nom Sipp, le logo, la mascotte, les illustrations et l’interface sont protégés. Toute reproduction sans autorisation est interdite.',
        ],
      },
    ],
  },
}

export const en: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: 'Terms of use and sale',
    intro: `These terms govern the use of Sipp, published by ${C.name}. By creating an account, you accept them. The French version prevails.`,
    sections: [
      {
        title: '1. The service',
        body: [
          'Sipp is a learning app: you say what you want to learn, and Sipp prepares a path of short interactive lessons, written with the help of artificial intelligence models.',
          'Sipp works in a web browser and can be installed on the home screen of a phone or computer.',
        ],
      },
      {
        title: '2. Your account',
        body: [
          'You must be at least 15 to create an account. A valid email address and a password of at least 8 characters are required.',
          'You are responsible for keeping your password secret. If you think someone found it, change it from your profile or with “Forgot password”.',
          'You can export your data and delete your account at any time from your profile. Deletion is permanent.',
        ],
      },
      {
        title: '3. Content written by AI',
        body: [
          'Lessons are written automatically by artificial intelligence models, then checked automatically. Despite these checks, they may contain errors or inaccuracies.',
          'Sipp is for learning and understanding: it is not medical, legal, financial or professional advice. For an important decision, ask a qualified person.',
          'You can report a mistake from any lesson: we use it to improve Sipp.',
          'Sipp declines some topics (for instance what could put someone in danger). Such a refusal is not a fault on our part.',
        ],
      },
      {
        title: '4. What you write',
        body: [
          'You keep ownership of what you write in Sipp (requests, answers, notes). You allow us to process it only to run the service, as described in the privacy policy.',
          'You agree not to use Sipp to obtain illegal, hateful or dangerous content, nor to disrupt the service (automated requests, getting around limits, intrusion attempts).',
          'Lessons generated for you are for your personal use. You may share them for non-commercial purposes.',
        ],
      },
      {
        title: '5. Plans and prices',
        body: [
          'The Free plan lets you try Sipp with short paths. The paid plans, Essentiel and Plus, add full paths, more Sips each month and features such as audio and module quizzes. Each plan is detailed on the Offers page.',
          PRICES_EN,
          'A free trial of Essentiel, without a card, may be offered once per account. When it ends, the account returns to Free, with no charge.',
          'Prices may change. A price change never applies to the current period, and you are told before the renewal it affects.',
        ],
      },
      {
        title: '6. Payment: Paddle, our reseller',
        body: [
          'Subscriptions are sold by Paddle.com Market Limited, acting as Merchant of Record: Paddle takes the payment, issues the invoice and handles VAT. Paddle’s buyer terms (paddle.com/legal/checkout-buyer-terms) apply to the payment.',
          'The subscription is paid in advance and renews automatically every month or year, depending on the option chosen.',
          'If a payment fails, Paddle retries for a few days, during which you keep access. Without payment, the account returns to Free. No Sip is deleted.',
        ],
      },
      {
        title: '7. Cancellation',
        body: [
          'You can cancel at any time from your profile (“Cancel”), in a few taps. Paid access stays open until the end of the period already paid, then the account returns to Free.',
          'We may suspend or close an account that seriously breaches these terms, after warning you except in an emergency.',
        ],
      },
      {
        title: '8. Right of withdrawal',
        body: [
          'As a consumer in the European Union, you have 14 days to withdraw from an online purchase. Since a subscription gives immediate access to digital content, at checkout you ask for access to start right away and acknowledge that you lose this right of withdrawal.',
          'We still apply the refund policy described on the “Refunds” page.',
        ],
      },
      {
        title: '9. Availability and liability',
        body: [
          'We do our best for Sipp to be available and reliable, but cannot guarantee it at all times (maintenance, a provider’s outage, network failure).',
          'We cannot be held liable for a decision based solely on a lesson, nor for indirect damage. Nothing in these terms limits the rights the law grants you as a consumer.',
        ],
      },
      {
        title: '10. Changes',
        body: [
          'These terms may change with the service. For an important change, you are told in the app or by email before it applies. If you disagree, you can cancel and delete your account.',
        ],
      },
      {
        title: '11. Disputes',
        body: [
          `These terms are governed by French law. If anything goes wrong, write to us first at ${C.email}: we will look for a solution together.`,
          'You can also use a consumer mediator free of charge, or the European online dispute resolution platform (ec.europa.eu/consumers/odr). Failing an agreement, the courts provided by law have jurisdiction; as a consumer, you may always use those where you live.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    intro: `This page explains which data Sipp uses, why, and how you stay in control. The data controller is ${C.name}, ${C.address}. Contact: ${C.email}. The French version prevails.`,
    sections: [
      {
        title: 'The data we use',
        body: [
          'Your account: email address, password (only stored as an irreversible hash, never in clear), language, timezone, date you agreed to AI processing.',
          'Your learning: what you ask to learn, the paths and lessons written for you, your answers, stars, streaks, notes, concepts to review, reports and feedback on lessons.',
          'Your settings: daily goal, reminder time and, if you turn notifications on, your browser’s technical address to receive them.',
          'Your subscription: plan, status and dates. Card details are entered at Paddle: we never see them.',
          'Technical data: server logs, errors, and usage statistics (pages viewed, steps of the journey), without the text of your lessons or answers.',
        ],
      },
      {
        title: 'Why, and on what basis',
        body: [
          'Running Sipp (creating your account, writing and showing your lessons, tracking progress, managing your subscription): performance of the contract you accept when signing up.',
          'Sending your requests to AI models: with your consent, asked before your first request.',
          'Account emails (welcome, password): performance of the contract. The reminder email after a few days without a lesson: legitimate interest in helping you keep your habit; turn it off in one click from the email or your profile.',
          'Security, abuse prevention, audience measurement and fixing errors: legitimate interest in providing a reliable service.',
          'Billing and accounting: legal obligation.',
        ],
      },
      {
        title: 'Who receives your data',
        body: [
          'Only the Sipp team has access, and we never sell your data. We use these providers, each for its own task only:',
          `${H.name} (hosting of the service and database, United States).`,
          'OpenRouter, which passes your requests and questions to OpenAI and Anthropic models to write your lessons (United States). Your email and identity are not sent to them.',
          'Paddle (payment, invoicing, VAT; United Kingdom and European Union).',
          'Resend (sending emails, United States).',
          'PostHog (usage statistics, hosted in the European Union) and Sentry (error tracking): you are known there by a number, never by your email.',
          'Your browser’s notification service (Apple, Google or Mozilla), if you turn reminders on.',
          'Transfers outside the European Union rely on the European Commission’s standard contractual clauses or the Data Privacy Framework.',
        ],
      },
      {
        title: 'How long',
        body: [
          'Account and learning data are kept as long as your account exists, and erased when you delete it.',
          'Password reset links expire after one hour.',
          'Billing data is kept 10 years, as the law requires, detached from your account if it is deleted.',
          'Technical logs are kept 12 months at most.',
        ],
      },
      {
        title: 'Your rights',
        body: [
          'You can access, correct and erase your data, restrict its use, object to some processing and get it in a readable format. Two of these rights are right in your profile: “Export my data” and “Delete my account”.',
          `For anything else, write to ${C.email}. We answer within a month.`,
          'If you believe your rights are not respected, you can complain to the CNIL (cnil.fr), the French data protection authority.',
        ],
      },
      {
        title: 'Storage on your device',
        body: [
          'Sipp uses no advertising cookies. The app keeps on your device (the browser’s local storage) your session, your preferences (theme, sounds, language), a copy of lessons to read them offline and the identifier used for usage statistics.',
        ],
      },
      {
        title: 'Minors',
        body: ['Sipp is for people aged 15 and over.'],
      },
    ],
  },
  refunds: {
    title: 'Refunds',
    intro: 'We want you to pay for Sipp because it is useful to you. Here is how refunds work. The French version prevails.',
    sections: [
      {
        title: 'First payment: 14 days to change your mind',
        body: [
          `If Sipp isn’t right for you, write to us within 14 days of a subscription’s first payment, at ${C.email} from your account’s address: we refund it in full, no questions asked. The subscription is then cancelled.`,
        ],
      },
      {
        title: 'Renewals',
        body: [
          'Renewals are not refunded, but you can cancel at any time from your profile: no further charge is made, and access stays open until the end of the period already paid.',
          'If you forgot to cancel a yearly subscription, write to us within 7 days of its renewal if you have not used Sipp since: we will look at your request kindly.',
        ],
      },
      {
        title: 'Technical problem',
        body: ['If a problem on our side kept you from using what you paid for, write to us: we refund the period concerned.'],
      },
      {
        title: 'How it works',
        body: [
          'The refund is paid by Paddle, our reseller, to the payment method used, usually within 5 to 10 business days. You can also ask Paddle directly through the link in your invoice email (paddle.net).',
        ],
      },
    ],
  },
  notice: {
    title: 'Legal notice',
    sections: [
      {
        title: 'Publisher',
        body: [C.name, C.form, C.address, C.registration, C.vat, `Contact: ${C.email}`, `Publication director: ${C.publisher}`],
      },
      {
        title: 'Hosting',
        body: [H.name, H.address.replace('États-Unis', 'United States'), H.website],
      },
      {
        title: 'Intellectual property',
        body: ['The Sipp name, logo, mascot, illustrations and interface are protected. Any reproduction without permission is forbidden.'],
      },
    ],
  },
}
