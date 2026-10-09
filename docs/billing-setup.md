# Paiements Paddle : mise en route

Paddle est le vendeur officiel (merchant of record) : il encaisse, facture, gère la TVA et le portail client. Sipp reflète l'abonnement dans `user.plan`. Tant que toutes les variables ci-dessous ne sont pas renseignées, les offres payantes restent en « Bientôt ».

## 1. Compte sandbox

1. Créer un compte sur https://sandbox-vendors.paddle.com.
2. **Catalog > Products** : créer « Sipp Essentiel » et « Sipp Plus », puis 4 prix récurrents en EUR, **taxe incluse** :
   - Essentiel : 5,99 €/mois et 59,90 €/an
   - Plus : 12,99 €/mois et 129,90 €/an
   - Pas d'essai côté Paddle : l'essai de 7 jours est géré par Sipp, sans carte.
3. **Checkout > Checkout settings** : renseigner le *default payment link* avec l'URL du web (ex. `https://<web>/offers`). Sans lui, Paddle refuse de créer des transactions.
4. **Developer tools > Authentication** : créer une clé API (serveur) et un *client-side token* (public).
5. **Developer tools > Notifications** : nouvelle destination
   - URL : `https://<api>/billing/webhook/paddle`
   - Événements : `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.trialing`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `transaction.completed`, `transaction.paid`, `transaction.payment_failed`, `transaction.past_due`, `adjustment.created`, `adjustment.updated`
   - Copier la *secret key* de la destination.

## 2. Variables Railway (sipp-app et sipp-worker)

| Variable | Valeur |
|---|---|
| `PADDLE_ENV` | `sandbox` puis `production` |
| `PADDLE_API_KEY` | clé API serveur (secrète) |
| `PADDLE_WEBHOOK_SECRET` | secret de la destination webhook (secret) |
| `PADDLE_CLIENT_TOKEN` | token client (public) |
| `PADDLE_PRICE_BASIC_MONTH` / `_BASIC_YEAR` | `pri_...` |
| `PADDLE_PRICE_PLUS_MONTH` / `_PLUS_YEAR` | `pri_...` |
| `PUBLIC_APP_URL` | URL du web, pour le retour après paiement |

Les montants affichés viennent de `plan_prices` dans `backend/app/config.py` (centimes TTC). Si un prix change dans Paddle, mettre à jour ce réglage aussi.

La migration `0010_billing` passe automatiquement au démarrage de l'API.

## 3. Tester

- Carte de test sandbox : `4242 4242 4242 4242`, date future, CVC quelconque.
- Parcours : Offres > case de consentement > S'abonner > paiement > retour sur `/billing/return`, qui attend la confirmation du webhook.
- Profil : « Gérer » et « Résilier » ouvrent le portail Paddle.
- En local, exposer l'API avec un tunnel (`cloudflared tunnel --url http://localhost:8000`) et pointer une destination webhook sandbox dessus. Le simulateur de webhooks Paddle permet de rejouer chaque événement.
- Le worker relit toutes les 6 h les abonnements actifs sans nouvelles depuis 20 h, au cas où un webhook serait perdu.

## 4. Passage en production

1. Compte Paddle live validé (vérification d'identité et du site). Paddle exige des CGU, une politique de confidentialité et une politique de remboursement en ligne, et l'approbation du domaine web.
2. Recréer produits, prix, clés et destination webhook en live.
3. Remplacer les variables Railway et passer `PADDLE_ENV=production`.

## Comportements à connaître

- **Paiement échoué** (`past_due`) : accès gardé `BILLING_GRACE_DAYS` jours (7 par défaut), puis retour en Gratuit si Paddle n'a pas réussi à encaisser.
- **Résiliation** : l'accès reste jusqu'à la fin de la période payée.
- **Passage en Gratuit** : aucun Sip n'est supprimé, seule la création est bloquée au-delà des limites.
- **Suppression de compte** : l'abonnement est d'abord résilié chez Paddle (sinon la suppression est refusée), les lignes de facturation sont gardées sans lien avec le compte.
- **Remboursements et litiges** : enregistrés dans `billing_records` ; un litige (chargeback) est signalé dans les logs. Rembourser ne coupe pas l'accès : résilier aussi l'abonnement dans Paddle si besoin.
- **Double abonnement** : bloqué au checkout ; si deux paiements passent quand même (deux onglets), une erreur est loguée pour rembourser l'un des deux.
