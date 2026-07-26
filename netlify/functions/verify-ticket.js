// netlify/functions/verify-ticket.js
//
// Rôle : appelée par control.html à chaque scan. Trois vérifications, dans
// l'ordre, et on s'arrête à la première qui échoue :
//   1) la signature HMAC correspond bien au ticketId (donc le QR n'a pas été
//      fabriqué à la main) ;
//   2) le ticket existe réellement dans Firestore ;
//   3) il n'a pas déjà été scanné (transaction atomique pour éviter que deux
//      scans simultanés du même ticket passent tous les deux).

const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const HMAC_SECRET = process.env.TICKET_HMAC_SECRET;

function sign(ticketId) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(ticketId).digest('hex').slice(0, 24);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ status: 'error', message: 'Méthode non autorisée.' }) };
  }
  if (!HMAC_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Configuration serveur incomplète.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ status: 'error', message: 'Requête invalide.' }) };
  }

  // Le contenu brut scanné est "BRUNCH-PHENIX57|<ticketId>|<signature>"
  const raw = (payload.raw || '').trim();
  const parts = raw.split('|');
  if (parts.length !== 3 || parts[0] !== 'BRUNCH-PHENIX57') {
    return { statusCode: 200, body: JSON.stringify({ status: 'invalid', message: 'QR non reconnu (mauvais format).' }) };
  }
  const [, ticketId, signature] = parts;

  const expected = sign(ticketId);
  if (!safeEqual(expected, signature)) {
    return { statusCode: 200, body: JSON.stringify({ status: 'invalid', message: 'Signature invalide — ticket falsifié ou corrompu.' }) };
  }

  const ticketRef = db.collection('tickets').doc(ticketId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ticketRef);
      if (!doc.exists) {
        return { status: 'not_found', message: 'Ticket inconnu.' };
      }
      const data = doc.data();
      if (data.used) {
        return {
          status: 'already_used',
          message: `Déjà scanné le ${data.usedAt ? data.usedAt.toDate().toLocaleString('fr-FR') : ''}.`,
          nom: data.nom,
          ticketNo: data.ticketNo,
        };
      }
      tx.update(ticketRef, {
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { status: 'ok', message: 'Ticket valide — accès autorisé.', nom: data.nom, ticketNo: data.ticketNo };
    });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: 'Erreur serveur pendant la vérification.' }) };
  }
};
