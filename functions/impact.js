"use strict";
/**
 * Impact visible : un commerçant publie une courte actualité (« Suite à vos avis, nous… »), validée par
 * l'équipe NOOVA avant toute publication. Une fois publiée :
 *   - elle apparaît dans la communauté de la ville (communityEvents, type « merchant_post ») ;
 *   - les habitants qui ont répondu (aux questions rattachées, sinon à n'importe quelle question du
 *     commerce) reçoivent « Ton avis a compté », par deliver() — donc soumis à toutes les règles
 *     habituelles (1 notification/jour, silence 21h–9h, réglage « Actualités des commerces », décroissance) ;
 *   - au plus UNE actualité notifiée par commerce tous les NOTIFY_GAP_DAYS (les suivantes restent
 *     visibles dans la communauté, sans notification).
 * Le commerçant ne déclenche jamais lui-même une notification : seul le passage à « published »,
 * réservé à l'admin par les règles Firestore, le fait.
 */
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const CFG = require("./engagementConfig");
const N = require("./notifications")._t;
const { applyOverrides } = require("./configStore")._t;

const db = () => getFirestore();
const DAY = 86400000;

// Habitants à prévenir : ont répondu (réponse non signalée) à une question rattachée, ou à défaut à
// une question quelconque du commerce.
async function audienceOf(merchantId, campaignIds) {
  const snap = await db().collection("answers").where("merchantId", "==", merchantId)
    .select("userId", "campaignId", "flagged").limit(CFG.IMPACT.MAX_AUDIENCE_SCAN).get();
  const uids = new Set();
  snap.forEach((d) => {
    const a = d.data();
    if (a.flagged || !a.userId) return;
    if (campaignIds.length && !campaignIds.includes(a.campaignId)) return;
    uids.add(a.userId);
  });
  return [...uids];
}

// Autorise (et enregistre) la notification si la dernière actualité notifiée de ce commerce est assez ancienne.
async function takeNotifySlot(merchantId, now) {
  const ref = db().collection("merchants").doc(merchantId);
  return db().runTransaction(async (tx) => {
    const last = ((await tx.get(ref)).data() || {}).lastImpactNotifyAt || 0;
    if (last && now - last < CFG.IMPACT.NOTIFY_GAP_DAYS * DAY) return false;
    tx.update(ref, { lastImpactNotifyAt: now });
    return true;
  });
}

async function publishCore(postId, post) {
  await applyOverrides();
  const now = await N.nowMs();
  const mid = post.merchantId;
  const mSnap = await db().collection("merchants").doc(mid).get();
  const m = mSnap.data() || {};
  const brand = m.brandName || m.name || post.merchantName || "Un commerce";
  const text = String(post.text || "").slice(0, CFG.IMPACT.MAX_TEXT);
  const campaignIds = (post.campaignIds || []).slice(0, CFG.IMPACT.MAX_CAMPAIGNS_LINKED);

  // 1. Communauté : identifiant déterministe → jamais deux fois.
  const city = String(m.city || post.city || "").toLowerCase();
  if (city) {
    await db().collection("communityEvents").doc(`post_${postId}`).set({
      type: "merchant_post", userId: null, displayName: brand, brand, merchantId: mid, postId,
      city, text, likeCount: 0, commentCount: 0, createdAt: FieldValue.serverTimestamp(),
    });
  }

  // 2. Habitants concernés.
  const audience = await audienceOf(mid, campaignIds);
  const allowed = audience.length ? await takeNotifySlot(mid, now) : false;
  let content;
  try { content = N.copy.impact({ merchant: brand, text }); }
  catch (e) { content = N.copy.impact({ merchant: brand, text: "Découvre ce qui change grâce aux réponses." }); }
  const stats = { sent: 0, queued: 0, skipped: 0 };
  if (allowed) {
    for (let i = 0; i < audience.length; i += 20) {
      const res = await Promise.all(audience.slice(i, i + 20).map((uid) => N.deliver(uid, "impact", content, { key: `post_${postId}`, now }).catch((e) => { logger.error("impact deliver", { message: e.message }); return { status: "skip" }; })));
      res.forEach((r) => { if (r.status === "sent") stats.sent++; else if (r.status === "queued") stats.queued++; else stats.skipped++; });
    }
  }
  await db().collection("merchantPosts").doc(postId).update({
    audience: audience.length, notified: allowed, notifySent: stats.sent, notifyQueued: stats.queued,
    notifyNote: audience.length === 0 ? "no_audience" : (allowed ? "sent" : "gap"),
  });

  // 3. Retour au commerçant (in-app + e-mail).
  const message = audience.length === 0
    ? "Elle est visible dans la communauté. Personne n'a encore répondu à vos questions : dès que ce sera le cas, vos prochaines actualités pourront être notifiées."
    : allowed
      ? `Elle est visible dans la communauté et ${audience.length} habitant${audience.length > 1 ? "s" : ""} qui ${audience.length > 1 ? "vous ont" : "vous a"} répondu ${audience.length > 1 ? "sont prévenus" : "est prévenu"}.`
      : `Elle est visible dans la communauté. Une seule actualité par commerce est notifiée tous les ${CFG.IMPACT.NOTIFY_GAP_DAYS} jours : les habitants ne sont pas prévenus cette fois.`;
  await N.notifyMerchant(mid, `post_ok_${postId}`, { type: "actualite", title: "Votre actualité est publiée", message });
  return { audience: audience.length, notified: allowed, ...stats };
}

async function rejectCore(postId, post) {
  const why = post.rejectionReason ? ` Motif : ${post.rejectionReason}` : "";
  await N.notifyMerchant(post.merchantId, `post_ko_${postId}`, { type: "actualite", title: "Votre actualité n'a pas été publiée", message: `Vous pouvez la corriger et la renvoyer depuis votre espace.${why}` });
}

const onMerchantPostReview = onDocumentUpdated("merchantPosts/{postId}", async (event) => {
  const b = event.data.before.data(), a = event.data.after.data();
  if (b.status === a.status) return;
  if (a.status === "published") await publishCore(event.params.postId, a);
  else if (a.status === "rejected") await rejectCore(event.params.postId, a);
});

module.exports = { onMerchantPostReview, _t: { publishCore, audienceOf, takeNotifySlot } };
