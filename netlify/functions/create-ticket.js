// netlify/functions/create-ticket.js
//
// Rôle : c'est le SEUL endroit où un ticket "officiel" peut naître.
// - L'ID du ticket est un UUID généré ici (imprévisible, impossible à deviner).
// - La signature est un HMAC-SHA256 calculé avec un secret stocké dans une
//   variable d'environnement Netlify (jamais envoyé au navigateur).
// - Tout est écrit dans Firestore AVANT d'être renvoyé au client : le PDF
//   généré côté client n'est donc qu'une représentation visuelle d'un ticket
//   qui existe déjà, vérifiable, côté serveur.

const crypto = require('crypto');
const { randomUUID } = crypto;
const admin = require('firebase-admin');

// --- Initialisation Firebase Admin (une seule fois par instance de fonction) ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Sur Netlify, les sauts de ligne de la clé privée doivent être ré-échappés
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const HMAC_SECRET = process.env.TICKET_HMAC_SECRET; // secret partagé serveur uniquement
const EVENT_TAG = 'PAIYA-GLOIRE-4';

function sign(ticketId) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(ticketId).digest('hex').slice(0, 24);
}

// Numéro lisible ALÉATOIRE (ex. PG4-483920) plutôt que séquentiel — plus
// difficile à deviner d'un ticket à l'autre, et visuellement plus marquant
// sur le visuel. Ce numéro reste un simple affichage humain, jamais utilisé
// seul pour authentifier quoi que ce soit (l'UUID + signature s'en chargent).
// On vérifie l'unicité en base pour éviter (même si improbable) deux tickets
// avec le même numéro affiché.
async function randomDisplayNumber() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const n = crypto.randomInt(100000, 999999); // 6 chiffres
    const candidate = 'PG4-' + n;
    const existing = await db.collection('tickets').where('ticketNo', '==', candidate).limit(1).get();
    if (existing.empty) return candidate;
  }
  // Filet de sécurité extrêmement improbable à atteindre : on ajoute un
  // suffixe basé sur l'heure pour garantir malgré tout l'unicité.
  return 'PG4-' + crypto.randomInt(100000, 999999) + '-' + Date.now().toString().slice(-4);
}

// Le prix est déterminé ICI, côté serveur, à partir du type — jamais confié
// au client. Comme ça, personne ne peut se générer un ticket "12k" en
// trafiquant la requête alors qu'il a choisi "Hors EMG" dans le formulaire.
const TYPE_PRICES = {
  emg: { label: 'Ticket EMG', amount: 12000 },
  hors: { label: 'Ticket Hors EMG', amount: 15000 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée.' }) };
  }

  if (!HMAC_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Configuration serveur incomplète (secret manquant).' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Requête invalide.' }) };
  }

  const nom = (payload.nom || '').trim();
  const tel = (payload.tel || '').trim();
  const type = (payload.type || '').trim();

  if (!nom || !tel) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nom et téléphone sont requis.' }) };
  }
  if (!TYPE_PRICES[type]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Type de ticket invalide.' }) };
  }
  // Validation basique — à muscler si besoin (limite de longueur, etc.)
  if (nom.length > 120 || tel.length > 40) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Champs trop longs.' }) };
  }

  const ticketId = randomUUID();
  const signature = sign(ticketId);
  const ticketNo = await randomDisplayNumber();
  const { label: typeLabel, amount: priceAmount } = TYPE_PRICES[type];

  await db.collection('tickets').doc(ticketId).set({
    ticketId,
    ticketNo,
    nom,
    tel,
    type,
    typeLabel,
    priceAmount,
    signature,
    used: false,
    usedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    event: EVENT_TAG,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ ticketId, ticketNo, signature, type, typeLabel, priceAmount }),
  };
};
