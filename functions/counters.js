"use strict";
/**
 * Compteurs du fil de la communauté. Avant : chaque publication affichée coûtait 3 lectures (liste des
 * « j'aime », mon « j'aime », liste des commentaires) à chaque rafraîchissement. Maintenant les totaux
 * sont portés par la publication elle-même (likeCount, commentCount), recalculés par une agrégation
 * (donc exacts même si un déclencheur est livré deux fois).
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");

const db = () => getFirestore();

async function recount(eventId, sub, field) {
  const ref = db().collection("communityEvents").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) return;                                   // publication supprimée
  const n = (await ref.collection(sub).count().get()).data().count;
  if (snap.data()[field] !== n) await ref.update({ [field]: n });
}

const onFeedLike = onDocumentWritten("communityEvents/{eventId}/likes/{uid}", (e) => recount(e.params.eventId, "likes", "likeCount"));
const onFeedComment = onDocumentWritten("communityEvents/{eventId}/comments/{commentId}", (e) => recount(e.params.eventId, "comments", "commentCount"));

module.exports = { onFeedLike, onFeedComment, _t: { recount } };
