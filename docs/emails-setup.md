# Emails (Resend) : mise en route

Sipp envoie quatre emails : **bienvenue** (inscription), **lien de réinitialisation** du mot de passe, **« ton mot de passe a été changé »**, et la **relance** quand une personne n'a pas fait de leçon depuis 3 jours (une seule fois par pause, à 18 h heure locale, désactivable depuis l'email ou le profil). Tant que `RESEND_API_KEY` est vide, rien ne part : les emails sont seulement écrits dans les logs.

## 1. Compte et domaine

1. Créer le compte sur https://resend.com.
2. **Domains > Add domain** : `sipp.app` (ou un sous-domaine comme `mail.sipp.app`). Ajouter chez le registrar les enregistrements DNS affichés (SPF, DKIM et, conseillé, DMARC), puis attendre que le domaine passe en **Verified**.
3. **API Keys > Create** : droit « Sending access » limité à ce domaine. La clé n'apparaît qu'une fois.
4. Vérifier que `SUPPORT_EMAIL` (hello@sipp.app par défaut) reçoit bien les emails : c'est l'adresse de réponse de tous les envois.

## 2. Variables Railway (sipp-app **et** sipp-worker)

| Variable | Valeur |
|---|---|
| `RESEND_API_KEY` | `re_...` (secrète) |
| `EMAIL_FROM` | `Sipp <bonjour@sipp.app>` : l'adresse doit être sur le domaine vérifié |
| `SUPPORT_EMAIL` | adresse de réponse, `hello@sipp.app` par défaut |
| `PUBLIC_APP_URL` | URL publique du web (liens des emails), ex. `https://sipp.app` |

L'API envoie les emails de compte ; le worker envoie les relances. Optionnel : `NUDGE_AFTER_DAYS` (3), `NUDGE_WINDOW_DAYS` (14 : une pause plus ancienne ne reçoit rien, pour ne pas écrire à tous les anciens comptes le jour de l'activation), `NUDGE_LOCAL_HOUR` (18).

Si `AUTH_RATE_LIMITS` est défini dans Railway, ajouter `"forgot":5,"reset":10,"password":10` (sinon ces valeurs par défaut s'appliquent).

Côté web, définir aussi la variable de build `VITE_PUBLIC_URL` (ex. `https://sipp.app`) : elle sert aux aperçus de liens, à l'URL canonique, à `robots.txt` et au `sitemap.xml`.

La migration `0015_emails` passe automatiquement au démarrage de l'API.

## 3. Tester

- Mot de passe oublié depuis l'écran de connexion : l'email arrive, le lien ouvre `/reset-password`, le nouveau mot de passe connecte et déconnecte les autres appareils.
- Profil > Changer mon mot de passe : email « mot de passe changé ».
- Relance : dans **Resend > Emails**, chaque envoi est visible avec son statut. Pour la forcer en test, mettre `NUDGE_AFTER_DAYS=1` et `NUDGE_LOCAL_HOUR` à l'heure courante sur le worker, puis revenir aux valeurs normales.
