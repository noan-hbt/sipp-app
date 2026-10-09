# Paiements Paddle : mise en route

Paddle est le vendeur officiel (merchant of record) : il encaisse, facture, gère la TVA et le portail client. Sipp reflète l'abonnement dans `user.plan`. Tant que toutes les variables ci-dessous ne sont pas renseignées, les offres payantes restent en « Bientôt ».

## 1. Compte sandbox et catalogue

Créer d'abord le compte sur https://sandbox-vendors.paddle.com. Dans **Developer tools > Authentication**, créer une clé API serveur avec les droits `product.read/write`, `price.read/write` et `notification_setting.read/write`; ajouter `client_token.read/write` pour générer/réutiliser le token web. Aucune clé ne se trouve dans le dépôt.

Depuis la racine du dépôt, lancer le script en PowerShell (la clé reste dans l'environnement du terminal) :

```powershell
$env:PADDLE_API_KEY = "pdl_sdbx_..."
$env:PADDLE_ENV = "sandbox"
python backend/scripts/paddle_setup.py --api-url https://<api-publique>
```

Le script réutilise les produits par nom/métadonnée `custom_data`, et les prix par nom, métadonnée ou signature exacte. Il configure `Sipp Essentiel` et `Sipp Plus` (`tax_category=saas`), puis les prix récurrents TTC (`tax_mode=internal`) : Essentiel 5,99 €/mois et 59,90 €/an; Plus 12,99 €/mois et 129,90 €/an. Aucun essai Paddle : l'essai Sipp de 7 jours reste sans carte. Il crée/réutilise la destination webhook et le token Paddle.js si les droits API le permettent.

Pour prévisualiser les créations et mises à jour, ajouter `--dry-run`; ce mode n'effectue que des GET et ne crée aucun objet. À la fin, le script affiche les variables à coller et les commandes Railway pour `sipp-app` et `sipp-worker`. La clé API et le secret webhook apparaissent dans la sortie console, jamais dans un fichier. Si le droit `client_token.*` manque, créer le token dans **Developer tools > Authentication**. Pour inclure sa valeur dans les commandes affichées, saisir aussi `$env:PADDLE_CLIENT_TOKEN = "test_..."` dans le terminal avant de relancer le script; sinon, ajouter ce token manuellement dans Railway.

Restent manuels dans le dashboard : création/validation du compte, **Checkout > Checkout settings > Default payment link** vers le web (ex. `https://<web>/offers`), et approbation du domaine en production. Sandbox approuve automatiquement les domaines. Pour le live, valider le compte et publier CGU, politique de confidentialité et politique de remboursement avant approbation du domaine.

## 2. Variables Railway (sipp-app et sipp-worker)

| Variable | Valeur |
|---|---|
| `PADDLE_ENV` | `sandbox` puis `production` |
| `PADDLE_API_KEY` | clé API serveur (secrète) |
| `PADDLE_WEBHOOK_SECRET` | secret de la destination webhook (secret) |
| `PADDLE_CLIENT_TOKEN` | token client (public) |
| `PADDLE_PRICE_BASIC_MONTH` / `_BASIC_YEAR` | créés/réutilisés par le script (`pri_...`) |
| `PADDLE_PRICE_PLUS_MONTH` / `_PLUS_YEAR` | créés/réutilisés par le script (`pri_...`) |
| `PUBLIC_APP_URL` | à définir manuellement : URL du web pour le retour après paiement |

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
2. Créer une clé API live, définir `PADDLE_ENV=production`, puis relancer le script avec les mêmes paramètres et l'URL API live. Sandbox et live ont des catalogues, clés, tokens et destinations distincts.
3. Coller les nouvelles valeurs dans Railway et approuver le domaine web dans Paddle avant d'activer les paiements.

## Comportements à connaître

- **Paiement échoué** (`past_due`) : accès gardé `BILLING_GRACE_DAYS` jours (7 par défaut), puis retour en Gratuit si Paddle n'a pas réussi à encaisser.
- **Résiliation** : l'accès reste jusqu'à la fin de la période payée.
- **Passage en Gratuit** : aucun Sip n'est supprimé, seule la création est bloquée au-delà des limites.
- **Suppression de compte** : l'abonnement est d'abord résilié chez Paddle (sinon la suppression est refusée), les lignes de facturation sont gardées sans lien avec le compte.
- **Remboursements et litiges** : enregistrés dans `billing_records` ; un litige (chargeback) est signalé dans les logs. Rembourser ne coupe pas l'accès : résilier aussi l'abonnement dans Paddle si besoin.
- **Double abonnement** : bloqué au checkout ; si deux paiements passent quand même (deux onglets), une erreur est loguée pour rembourser l'un des deux.
