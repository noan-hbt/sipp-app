# Lancement : ce qu'il reste à faire

Point d'étape au 2 novembre 2026, après l'ajout de la réinitialisation du mot de passe, des emails Resend, des pages légales et des aperçus de liens (PR #17). Coche au fur et à mesure.

## 1. À faire par toi (rien ne peut se faire dans le code)

### Société et pages légales
- [ ] Remplir `web/src/legal/company.ts` : raison sociale, forme juridique et capital, **adresse de domiciliation**, SIREN/RCS, n° de TVA (ou « TVA non applicable, art. 293 B du CGI »), directeur·rice de la publication, ville du siège. Tant que ce n'est pas fait, les pages affichent `[À compléter]`.
- [ ] Vérifier l'adresse de l'hébergeur (Railway) dans le même fichier, sur https://railway.com/legal/terms.
- [ ] **Désigner un médiateur de la consommation** (obligatoire en France pour vendre à des particuliers, par exemple CM2C ou Medicys), puis ajouter son nom et son site à la section 11 des CGU dans `web/src/legal/docs.ts`.
- [ ] Valider ou changer la politique de remboursement (`docs.ts`, section `refunds`). Le brouillon actuel prévoit : premier paiement remboursable sous 14 jours, renouvellements non remboursés, geste possible sous 7 jours pour un renouvellement annuel oublié.
- [ ] Faire relire les CGU/CGV, la politique de confidentialité et les mentions légales par un juriste. Après chaque changement de texte, mettre à jour `LEGAL_UPDATED` dans `company.ts`.

### Emails (Resend)
- [ ] Créer le compte Resend, vérifier le domaine (DNS : SPF, DKIM, DMARC) et créer une clé API : voir `docs/emails-setup.md`.
- [ ] Vérifier que `hello@sipp.app` reçoit bien les emails : c'est l'adresse de réponse de tous les envois et le contact affiché sur les pages légales.

### Variables Railway
- [ ] **sipp-app et sipp-worker** : `RESEND_API_KEY`, `EMAIL_FROM` (adresse sur le domaine vérifié), `SUPPORT_EMAIL`, `PUBLIC_APP_URL` (URL publique du web).
- [ ] Si `AUTH_RATE_LIMITS` est défini, y ajouter `"forgot":5,"reset":10,"password":10`.
- [ ] **sipp-web** : variable de build `VITE_PUBLIC_URL` (ex. `https://sipp.app`), utilisée pour les aperçus de liens, l'URL canonique, `robots.txt` et le sitemap.

### Paiements (Paddle live)
- [ ] Suivre `docs/billing-setup.md` § 4 : compte live validé, clés et prix live, domaine approuvé. Paddle demande les CGU, la politique de confidentialité et la politique de remboursement : elles sont en ligne sur `/legal/terms`, `/legal/privacy` et `/legal/refunds`.

### Après déploiement
- [ ] Tester avec un vrai compte : inscription (email de bienvenue), mot de passe oublié, changement de mot de passe, lien de désinscription.
- [ ] Coller l'URL du site dans WhatsApp ou LinkedIn pour vérifier l'aperçu, et dans le [Post Inspector de LinkedIn](https://www.linkedin.com/post-inspector/).
- [ ] Déclarer le sitemap dans Google Search Console (`https://sipp.app/sitemap.xml`).

## 2. Manques connus dans l'app (à coder)

Par ordre de priorité.

1. **Consentement aux statistiques (PostHog).** Elles se lancent sans accord. Comme elles suivent l'utilisateur par un identifiant, la CNIL exige en principe son consentement. À faire : un choix accepter/refuser au premier lancement (ou un réglage dans le profil), PostHog chargé seulement après accord. Sentry (erreurs) peut rester en intérêt légitime.
2. **Vérification de l'adresse email.** Une inscription n'est pas confirmée : une faute de frappe dans l'email rend la récupération du mot de passe impossible. Piste : un lien de confirmation dans l'email de bienvenue, et un rappel discret dans l'app tant que ce n'est pas fait.
3. **Durée de conservation des journaux.** La politique de confidentialité annonce « 12 mois au plus » pour les journaux techniques. Rien ne purge aujourd'hui la table `llm_calls` ni les lignes `password_resets` expirées. Ajouter une purge périodique dans le worker, ou changer le texte.
4. **Déconnexion immédiate des autres appareils.** Après un changement de mot de passe, les autres appareils perdent leur session, mais leur jeton d'accès reste valable jusqu'à 60 minutes. Pour couper tout de suite : un compteur de version de session sur `users`, vérifié dans `current_user`.
5. **Désinscription « en un clic » (RFC 8058).** L'en-tête `List-Unsubscribe` pointe vers la page web. Gmail et Yahoo exigent le bouton « se désabonner » en un clic (POST direct) au-delà de 5 000 emails par jour : à prévoir avant ce volume.
6. **Comptes inactifs.** Aucune règle de suppression des comptes abandonnés. Ce n'est pas obligatoire, mais c'est une bonne pratique RGPD (par exemple prévenir, puis supprimer après 3 ans sans connexion). Si tu l'ajoutes, le préciser dans la politique de confidentialité.
7. **Texte inutilisé.** `t.safety.age` dans `web/src/locales/*.ts` n'est plus affiché : il est remplacé par `t.legal.signup`. On peut le supprimer.

## 3. Idées pour après le lancement

- Connexion avec Google ou Apple : moins de mots de passe oubliés, inscription plus rapide.
- Récap hebdomadaire par email (leçons, notions, série), désactivable comme la relance.
- Aperçu de lien propre à chaque page partagée (par exemple l'image « J'ai fini mon Sip » pour un parcours terminé) : il faudrait générer l'image côté serveur.
- Page d'accueil statique (marketing) pour le référencement : l'app étant une PWA rendue en JavaScript, une page HTML légère indexerait mieux.

## Où trouver quoi

| Sujet | Fichiers |
|---|---|
| Emails (contenu, envoi) | `backend/app/emails.py` |
| Relance après 3 jours | `backend/app/nudges.py`, boucle `email_nudges` dans `backend/app/jobs/worker.py` |
| Routes mot de passe et désinscription | `backend/app/api/auth.py` |
| Réglages (délais, adresses) | `backend/app/config.py`, `backend/.env.example` |
| Écrans mot de passe et désinscription | `web/src/screens/PasswordReset.tsx`, `web/src/screens/Unsubscribe.tsx`, `web/src/components/ChangePassword.tsx` |
| Textes légaux | `web/src/legal/docs.ts` (FR et EN), `web/src/legal/company.ts` (infos société) |
| Aperçus de liens et SEO | `web/index.html`, plugin `seo()` dans `web/vite.config.ts`, `web/public/og-image.jpg` |
| Mise en route | `docs/emails-setup.md`, `docs/billing-setup.md` |
