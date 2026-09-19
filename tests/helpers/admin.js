"use strict";
// Compatibilité : les tests utilisent l'ancienne écriture `admin.firestore()` ; firebase-admin ≥ 13
// n'expose plus que l'API modulaire. Ce petit adaptateur évite de réécrire chaque suite.
const path = require("path");
const fromFunctions = (m) => require(require.resolve(m, { paths: [path.join(__dirname, "..", "..", "functions")] }));
const app = fromFunctions("firebase-admin/app");
const fs = fromFunctions("firebase-admin/firestore");
const au = fromFunctions("firebase-admin/auth");
module.exports = {
  initializeApp: (o) => (app.getApps().length ? app.getApp() : app.initializeApp(o)),
  firestore: Object.assign(() => fs.getFirestore(), { FieldValue: fs.FieldValue, Timestamp: fs.Timestamp }),
  auth: () => au.getAuth(),
};
