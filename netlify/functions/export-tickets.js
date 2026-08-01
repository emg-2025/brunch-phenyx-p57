// netlify/functions/export-tickets.js
//
// Rôle : génère un export CSV de tous les tickets enregistrés dans Firestore.
// Protégé par une clé secrète (ADMIN_EXPORT_SECRET) passée en paramètre d'URL,
// pour que seule la personne qui connaît la clé puisse télécharger la liste
// des inscrits (nom, tél — des données personnelles).

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

const DELIM = ';'; // Excel en français attend ; comme séparateur — , casse la mise en colonnes

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(DELIM) || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

exports.handler = async (event) => {
  const ADMIN_SECRET = process.env.ADMIN_EXPORT_SECRET;
  if (!ADMIN_SECRET) {
    return { statusCode: 500, body: 'Configuration serveur incomplète (clé export manquante).' };
  }

  const providedKey = event.queryStringParameters && event.queryStringParameters.key;
  if (providedKey !== ADMIN_SECRET) {
    return { statusCode: 403, body: 'Accès refusé.' };
  }

  const snapshot = await db.collection('tickets').orderBy('createdAt', 'asc').get();

  const rows = [
    'sep=' + DELIM, // indice explicite pour Excel, au cas où le séparateur régional diffère encore
    ['N° Ticket', 'Nom', 'Téléphone', 'Utilisé', "Date d'inscription"].map(csvEscape).join(DELIM),
  ];

  snapshot.forEach((doc) => {
    const d = doc.data();
    const createdAt = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString('fr-FR') : '';
    rows.push([
      d.ticketNo,
      d.nom,
      d.tel,
      d.used ? 'Oui' : 'Non',
      createdAt,
    ].map(csvEscape).join(DELIM));
  });

  const csv = '\uFEFF' + rows.join('\n'); // \uFEFF = BOM, pour qu'Excel affiche bien les accents

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inscrits-brunch-phenix-57.csv"',
    },
    body: csv,
  };
};
