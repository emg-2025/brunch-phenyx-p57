# Paiya de la Gloire 4 — Billetterie EMG

Adapté de la billetterie Brunch Phénix 57 (même architecture sécurisée), pour l'événement Excellence Médicale Groupe du samedi 12 septembre à VRIDI.

## Ce qui est spécifique à cet événement

- **Deux types de ticket** : EMG (12 000 F) et Hors EMG (15 000 F) — le prix est déterminé côté serveur à partir du type choisi, jamais confié au navigateur.
- **Deux visuels** intégrés directement dans `index.html` (`Ticket EMG` / `Ticket HORS EMG`), générés à partir de votre affiche originale.
- **Numérotation** : `PG4-0001`, `PG4-0002`... (compteur Firestore séparé de l'ancien événement).
- **QR signé** : contenu `PAIYA-GLOIRE-4|<ticketId>|<signature>`.

## Architecture (identique au Brunch Phénix 57)

```
index.html        → formulaire d'inscription + génération du ticket (2 visuels embarqués)
control.html       → scan à l'entrée, affiche aussi le type de ticket (EMG / Hors EMG)
netlify/functions/
  create-ticket.js → écrit le ticket dans Firestore, détermine le prix selon le type
  verify-ticket.js → vérifie signature + statut, marque "used"
  export-tickets.js → export CSV (avec colonnes Type, Montant, et totaux EMG/Hors EMG)
firestore.rules    → bloque tout accès direct depuis le navigateur
```

## Mise en place

**Vous pouvez réutiliser le même projet Firebase et les mêmes variables d'environnement Netlify** que pour le Brunch Phénix 57 (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `TICKET_HMAC_SECRET`, `ADMIN_EXPORT_SECRET`) — les tickets des deux événements resteront séparés dans Firestore (compteurs et champ `event` différents), donc pas de conflit.

Sinon, suivez les mêmes étapes que pour le premier événement (voir historique de conversation) :
1. Créer/réutiliser un dépôt GitHub avec exactement cette structure de fichiers
2. Connecter Netlify à ce dépôt (Import an existing project → GitHub)
3. Ajouter les variables d'environnement
4. Déployer

## À vérifier avant le jour J

- Testez un ticket EMG **et** un ticket Hors EMG pour confirmer que les deux visuels et prix s'affichent correctement
- Testez le scan avec `control.html` sur le lieu de l'événement (VRIDI) pour valider la connexion internet
- Téléchargez le CSV la veille (il inclut maintenant les totaux par type de ticket) comme filet de sécurité papier
