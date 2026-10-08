"use strict";
/**
 * Annonces de NOOVA (onglet Diffusion de l'admin).
 *
 * L'admin crée announcements/{id} ; ce déclencheur fait le reste :
 *  - habitants visés (toutes les villes ou une seule) : une ligne dans leur cloche, et une notification sur le téléphone
 *    (type « annonce », famille « Annonces de NOOVA » que chacun peut couper ; la nuit, elle part à 9h) ;
 *  - commerçants visés : une ligne dans la cloche de leur tableau de bord (comme avant).
 * Dans l'app, l'annonce s'affiche en carte en haut de l'accueil jusqu'à ce que l'habitant la ferme ; une annonce
 * marquée « importante » s'ouvre aussi en pop-up à la prochaine ouverture de l'app.
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const db = () => getFirestore();

async function fanOut(id, a) {
  const N = require("./notifications")._t;
  const title = String(a.title || "").trim().slice(0, 60), message = String(a.message || "").trim().slice(0, 240);
  const city = String(a.city || "all");
  const out = { users: 0, merchants: 0, push: 0 };
  const bell = { type: "noova_message", title, message, annId: id, read: false, createdAt: FieldValue.serverTimestamp() };
  if (a.forUsers) {
    let q = db().collection("users");
    if (city !== "all") q = q.where("city", "==", city);
    const users = (await q.get()).docs.filter((d) => !d.data().role || d.data().role === "user");
    for (let i = 0; i < users.length; i += 400) {
      const b = db().batch();
      users.slice(i, i + 400).forEach((d) => b.set(d.ref.collection("notifications").doc("ann_" + id), bell));
      await b.commit();
    }
    out.users = users.length;
    const content = { title: title || "NOOVA a une nouvelle pour toi", body: message, screen: "home" };
    const work = users.map((d) => async () => { const r = await N.deliver(d.id, "annonce", content, { key: id }).catch(() => null); if (r && (r.status === "sent" || r.status === "queued")) out.push++; });
    for (let i = 0; i < work.length; i += 40) await Promise.all(work.slice(i, i + 40).map((f) => f()));
  }
  if (a.forMerchants) {
    let q = db().collection("merchants");
    if (city !== "all") q = q.where("city", "==", city);
    const ms = (await q.get()).docs.filter((d) => d.data().isTest !== true && d.data().broadcast !== true);
    for (let i = 0; i < ms.length; i += 400) {
      const b = db().batch();
      ms.slice(i, i + 400).forEach((d) => b.set(d.ref.collection("notifications").doc("ann_" + id), bell));
      await b.commit();
    }
    out.merchants = ms.length;
  }
  await db().collection("announcements").doc(id).update({ recipientCount: out.users + out.merchants, pushSent: out.push, sentAt: FieldValue.serverTimestamp() });
  return out;
}

const onAnnouncementCreated = onDocumentCreated({ document: "announcements/{id}", region: "europe-west1", timeoutSeconds: 540, memory: "512MiB" }, async (event) => {
  const a = event.data && event.data.data();
  if (!a) return;
  const r = await fanOut(event.params.id, a);
  logger.info("annonce envoyée", { id: event.params.id, ...r });
});

module.exports = { onAnnouncementCreated, _t: { fanOut } };
