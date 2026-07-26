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
const EVENT_TAG = 'BRUNCH-PHENIX57';

function sign(ticketId) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(ticketId).digest('hex').slice(0, 24);
}

// Compteur atomique pour le numéro lisible (PHX57-0001, 0002, ...)
// Séparé de l'ID réel du ticket : ce numéro est juste un affichage humain,
// jamais utilisé seul pour authentifier quoi que ce soit.
async function nextDisplayNumber() {
  const counterRef = db.collection('_counters').doc('brunch-phenix57');
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? doc.data().value : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
}

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

  if (!nom || !tel) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nom et téléphone sont requis.' }) };
  }
  // Validation basique — à muscler si besoin (limite de longueur, etc.)
  if (nom.length > 120 || tel.length > 40) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Champs trop longs.' }) };
  }

  const ticketId = randomUUID();
  const signature = sign(ticketId);
  const displayNumber = await nextDisplayNumber();
  const ticketNo = 'PHX57-' + String(displayNumber).padStart(4, '0');

  await db.collection('tickets').doc(ticketId).set({
    ticketId,
    ticketNo,
    nom,
    tel,
    signature,
    used: false,
    usedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    event: EVENT_TAG,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ ticketId, ticketNo, signature }),
  };
};
