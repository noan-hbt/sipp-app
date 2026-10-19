import type { LegalPage, LegalPageKey } from './types'

/** Legal texts in English, translated from fr.ts (which prevails). Placeholders come from editor.ts. */
export const LEGAL_EN: Record<LegalPageKey, LegalPage> = {
  mentions: {
    title: 'Legal notice',
    sections: [
      {
        title: 'Publisher',
        body: [
          'Sipp is published by {name}, {status}.',
          'Address: {address}. Company number (SIREN): {siren}.',
          'Contact: {email}. Publishing director: {name}.',
        ],
      },
      {
        title: 'Hosting',
        body: ['The app and its data are hosted by Railway Corporation, San Francisco, California, United States (railway.com).'],
      },
      {
        title: 'Intellectual property',
        body: [
          'The Sipp name, the app, its illustrations, its mascot and its interface texts belong to the publisher. Any reproduction without written consent is prohibited.',
          'Lessons are written by artificial intelligence from your request. You may use them freely for your own learning.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    intro: 'This page explains, plainly, what data Sipp uses, why, with whom, and how you stay in control.',
    sections: [
      {
        title: 'Who is responsible',
        body: ['The data controller is {name} ({address}). For any question about your data: {email}.'],
      },
      {
        title: 'What we collect',
        body: [
          'Your account: your email address and your password, which we only store in hashed form that nobody can read back.',
          'What you want to learn: your requests, the learning profile and the paths Sipp builds from them.',
          'Your progress: lessons taken, answers to exercises, stars, streak, reviews, the passages you keep in your notebook, and your feedback and reports on lessons.',
          'Your settings: daily goal, reminder time, time zone, language and, if you turn reminders on, your device’s technical notification address.',
          'Your subscription: your plan and its status. Payment is handled by Paddle: we never see your card.',
          'Technical data: app errors (without your email or the content of your answers) and server logs.',
          'Usage statistics (screens viewed, main actions), only if you accept them.',
        ],
      },
      {
        title: 'Why, and on what basis',
        body: [
          'Providing the service (building your paths, saving your progress, reminding you of your lesson): performance of the contract you accept when creating your account.',
          'Managing your subscription and billing: contract and legal obligations.',
          'Keeping the app secure and preventing abuse (usage limits, error tracking): our legitimate interest.',
          'Measuring usage to improve Sipp: your consent, which you can withdraw at any time in your profile.',
          'Daily reminders: your agreement, given by turning notifications on, and revocable in your profile or your device settings.',
        ],
      },
      {
        title: 'Artificial intelligence',
        body: [
          'To write your lessons and answer your questions during a lesson, the text of your request and the lesson content are sent, through the OpenRouter service, to artificial intelligence model providers. Your email and identity are never passed to them.',
          'Avoid writing personal information you don’t need for learning (name, health, etc.) in your requests.',
          'Lessons are generated automatically and may contain mistakes: they are no substitute for a professional’s advice (health, law, finance).',
        ],
      },
      {
        title: 'Who we share it with',
        body: [
          'Only with the providers that run Sipp, each for its own task and under contract:',
          'Railway (hosting of the app and database, United States).',
          'OpenRouter and the model providers it calls (lesson generation, United States and other countries).',
          'Paddle (sale of subscriptions and payment, as our reseller).',
          'Sentry (error tracking, without identifying data).',
          'PostHog (usage statistics, hosted in the European Union, only with your consent).',
          'Some of these providers are located outside the European Union. Transfers rely on the safeguards provided by the GDPR (European Commission standard contractual clauses or Data Privacy Framework certification). We never sell your data.',
        ],
      },
      {
        title: 'How long',
        body: [
          'Your data is kept as long as your account exists. When you delete it, it is erased from our database immediately and permanently.',
          'Only what the law requires remains, such as invoices, kept by Paddle for the legal period, and the host’s technical logs, kept for a limited time.',
        ],
      },
      {
        title: 'Your rights',
        body: [
          'At any time you can access your data, correct it, erase it, get it in a readable format, object to a processing or ask for it to be restricted.',
          'Directly in your profile: “Export my data” and “Delete my account”. For anything else, email {email}. We answer within a month.',
          'If you believe your rights are not respected, you can complain to your data protection authority (in France, the CNIL: cnil.fr).',
        ],
      },
      {
        title: 'Storage on your device',
        body: [
          'Sipp keeps on your device what it needs to work: your sign-in session, your preferences (theme, sound, language) and a copy of your paths for offline use. This doesn’t require your consent.',
          'Usage statistics are only turned on if you accept them, in the banner or in your profile.',
        ],
      },
      {
        title: 'Minimum age',
        body: ['Sipp is for people aged 15 and over.'],
      },
      {
        title: 'Changes',
        body: ['We may update this policy. If something important changes, we let you know in the app.'],
      },
    ],
  },

  terms: {
    title: 'Terms of use and sale',
    intro: 'These terms govern the use of Sipp and its subscriptions. By creating your account, you accept them.',
    sections: [
      {
        title: 'The service',
        body: [
          'Sipp builds paths of short lessons on the topic of your choice, written by artificial intelligence, and helps you follow them (reviews, reminders, notebook).',
          'Lessons are generated automatically: despite our checks, they may contain mistakes or simplifications. They are for learning and are not professional advice, in particular medical, legal or financial. The “Report a problem” button on each lesson helps us fix them.',
        ],
      },
      {
        title: 'Your account',
        body: [
          'You must be at least 15 to create an account. You agree to give a valid email address and to keep your password secret.',
          'You can delete your account at any time from your profile.',
        ],
      },
      {
        title: 'Acceptable use',
        body: [
          'You agree not to use Sipp to get help harming yourself or others, to produce illegal content, or to get around the service’s limits (automated account creation, use by programs, resale).',
          'In case of clear abuse, we may suspend access to the account concerned, after warning you except in an emergency.',
        ],
      },
      {
        title: 'Content',
        body: [
          'What you write (requests, notes) remains yours. You allow us to process it only to run the service.',
          'You may freely use the generated lessons for your own learning. The app itself (code, design, illustrations, brand) remains the publisher’s property.',
        ],
      },
      {
        title: 'Plans and prices',
        body: [
          'The free plan gives access to a limited number of shorter paths. Paid plans (Essential, Plus) unlock full paths and extra features, detailed on the plans page.',
          'Prices are shown including all taxes before payment, monthly or yearly.',
          'Subscriptions are sold by Paddle.com, our reseller, which handles payment, invoicing and VAT. Paddle’s purchase terms apply to the payment.',
        ],
      },
      {
        title: 'Free trial',
        body: ['The Essential trial lasts 7 days and requires no credit card. At the end, you automatically go back to the free plan, without paying anything, unless you choose to subscribe.'],
      },
      {
        title: 'Renewal and cancellation',
        body: [
          'A subscription renews automatically at the end of each period (month or year), at the current price, which you are told about in advance.',
          'You can cancel it at any time from your profile (“Manage”, then “Cancel subscription”). Cancellation takes effect at the end of the period already paid: you keep your access until then.',
        ],
      },
      {
        title: 'Right of withdrawal and refunds',
        body: [
          'You have 14 days after subscribing to withdraw. When paying, you can ask to access the subscription right away: you then acknowledge that the service starts before this period ends.',
          'In any case, if you are not satisfied, you can ask for a refund of your first payment within 14 days, by emailing {email} or through your Paddle receipt.',
        ],
      },
      {
        title: 'Availability and liability',
        body: [
          'We do our best to keep Sipp available and reliable, without being able to guarantee it will never be interrupted or wrong. The service may change: features, plans and limits may evolve, and we let you know of any important change.',
          'We cannot be held liable for a decision made solely on the basis of a generated lesson.',
        ],
      },
      {
        title: 'Personal data',
        body: ['How it is processed is described in the privacy policy.'],
      },
      {
        title: 'Disputes',
        body: [
          'These terms are governed by French law. If something goes wrong, email us first at {email}: we always look for an amicable solution.',
          'You may also use the consumer mediator free of charge: {mediator}.',
        ],
      },
    ],
  },
}
