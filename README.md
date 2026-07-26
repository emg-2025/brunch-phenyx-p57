# Brunch Phénix 57 — billetterie sécurisée

## Ce qui a changé par rapport à la version "démo"

| Avant | Maintenant |
|---|---|
| Ticket généré et "validé" entièrement dans le navigateur | Le ticket n'existe que s'il a été créé par `create-ticket.js`, qui écrit dans Firestore |
| Numéro séquentiel prévisible (`PHX57-0001`) devinable | Le numéro reste affiché pour lisibilité, mais l'authentification repose sur un **UUID + signature HMAC**, pas sur ce numéro |
| QR = texte brut recopiable (`voir le code source`) | QR = `ticketId + signature HMAC` calculée avec un secret que le navigateur ne voit jamais |
| Aucun contrôle à l'entrée | `control.html` scanne, vérifie la signature, vérifie l'existence en base, et marque "utilisé" de façon atomique (impossible de réutiliser un ticket, même avec deux scans simultanés) |

## Architecture

```
index.html        → formulaire d'inscription (design conservé), appelle create-ticket
control.html       → scan à l'entrée, appelle verify-ticket
netlify/functions/
  create-ticket.js → écrit le ticket dans Firestore, renvoie {ticketId, ticketNo, signature}
  verify-ticket.js → vérifie signature + statut, marque "used" en transaction
firestore.rules    → bloque tout accès direct depuis le navigateur
```

## Mise en place (≈15-20 min)

### 1. Firebase
1. Créez (ou réutilisez) un projet Firebase, activez **Firestore**.
2. Dans *Paramètres du projet → Comptes de service*, générez une **clé privée** (fichier JSON).
3. Notez `project_id`, `client_email`, `private_key` de ce fichier — ils vont dans les variables d'environnement, jamais dans le code.
4. Déployez `firestore.rules` : `firebase deploy --only firestore:rules` (ou collez-les dans la console Firebase).

### 2. Variables d'environnement Netlify
Dans *Site settings → Environment variables*, ajoutez :

| Variable | Valeur |
|---|---|
| `FIREBASE_PROJECT_ID` | depuis la clé de service |
| `FIREBASE_CLIENT_EMAIL` | depuis la clé de service |
| `FIREBASE_PRIVATE_KEY` | depuis la clé de service (gardez les `\n`, Netlify les gère) |
| `TICKET_HMAC_SECRET` | une chaîne aléatoire longue, ex. générée avec `openssl rand -hex 32` — **à garder secrète, ne jamais la mettre dans index.html ou control.html** |

### 3. Déploiement
```bash
npm install
netlify deploy --prod
```
Netlify détecte automatiquement `netlify/functions/` et déploie les deux fonctions.

### 4. Le jour J
- Les invités s'inscrivent sur `index.html`, téléchargent leur PDF (identique visuellement à avant).
- À l'entrée, ouvrez `control.html` sur un téléphone/tablette : la caméra scanne, l'écran affiche ✅ valide / ⚠️ déjà utilisé / ❌ refusé.
- Un ticket scanné une fois ne peut plus être réutilisé, même en cas de copie du PDF.

## Ce qui reste volontairement simple (à ajouter si besoin plus tard)
- Envoi d'email réel (actuellement bouton simulé) — ajoutable avec une fonction Netlify + un service comme Resend/SendGrid.
- Lien avec un paiement confirmé (Wave, CinetPay) avant délivrance du ticket.
- Export CSV des inscriptions depuis Firestore pour la liste imprimée de secours.
