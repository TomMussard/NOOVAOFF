"use strict";
/**
 * Suggestions d'amis.
 *  - friendSuggestions : les amis de mes amis (amitiés réciproques uniquement), classés par nombre d'amis en commun.
 *  - matchContacts : retrouver, parmi les contacts de son téléphone (avec son autorisation), ceux qui sont sur NOOVA.
 *    L'app n'envoie jamais les adresses e-mail : seulement leur empreinte (SHA-256 de l'adresse en minuscules), comparée
 *    à l'index emailIndex/{empreinte} tenu par le serveur (functions/publicProfiles.js). Rien n'est conservé.
 * Un habitant qui coupe « Me proposer à d'autres habitants » (users.discoverable = false) n'apparaît dans aucune
 * suggestion ni recherche de contacts.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = () => getFirestore();
const MAX_FRIENDS = 40, MAX_RESULTS = 10, MAX_HASHES = 500;
const card = (uid, u, extra) => ({ uid, name: String(u.name || "Habitant").slice(0, 40), photoUrl: u.photoUrl || null, ...extra });
const usable = (u) => u && (!u.role || u.role === "user") && u.discoverable !== false;

// Demande d'ami déjà envoyée (et pas encore traitée) : la carte affiche « Demande envoyée », même après avoir
// rouvert l'app — on ne peut pas la renvoyer.
async function markSent(uid, list) {
  if (!list.length) return list;
  const reqs = await db().getAll(...list.map((x) => db().collection("users").doc(x.uid).collection("notifications").doc("friendreq_" + uid)));
  return list.map((x, i) => ({ ...x, sent: reqs[i].exists }));
}
async function suggestionsCore(uid) {
  const me = (await db().collection("users").doc(uid).get()).data() || {};
  const mine = new Set((me.friendUids || []).filter(Boolean));
  const fids = [...mine].slice(0, MAX_FRIENDS);
  const fDocs = fids.length ? await db().getAll(...fids.map((f) => db().collection("users").doc(f))) : [];
  const mutual = new Map(), via = new Map();
  for (const d of fDocs) {
    if (!d.exists) continue;
    const f = d.data();
    if (!(f.friendUids || []).includes(uid)) continue;                   // amitié non réciproque : pas de suggestion
    for (const c of (f.friendUids || []).slice(0, 100)) {
      if (!c || c === uid || mine.has(c)) continue;
      mutual.set(c, (mutual.get(c) || 0) + 1);
      if (!via.has(c)) via.set(c, []);
      if (via.get(c).length < 3) via.get(c).push(d.id);             // mes amis en commun (déjà connus de moi)
    }
  }
  const ranked = [...mutual.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const cDocs = ranked.length ? await db().getAll(...ranked.map(([c]) => db().collection("users").doc(c))) : [];
  const out = [];
  cDocs.forEach((d, i) => { if (d.exists && usable(d.data())) out.push(card(d.id, d.data(), { mutual: ranked[i][1], via: via.get(d.id) || [] })); });
  return { suggestions: await markSent(uid, out.slice(0, MAX_RESULTS)) };
}

async function matchCore(uid, hashes) {
  const list = [...new Set((Array.isArray(hashes) ? hashes : []).filter((h) => typeof h === "string" && /^[a-f0-9]{64}$/.test(h)))].slice(0, MAX_HASHES);
  if (!list.length) return { matches: [] };
  const me = (await db().collection("users").doc(uid).get()).data() || {};
  const mine = new Set(me.friendUids || []);
  const idx = await db().getAll(...list.map((h) => db().collection("emailIndex").doc(h)));
  const uids = [...new Set(idx.filter((d) => d.exists).map((d) => d.data().uid).filter((u) => u && u !== uid))];
  if (!uids.length) return { matches: [] };
  const docs = await db().getAll(...uids.map((u) => db().collection("users").doc(u)));
  return { matches: await markSent(uid, docs.filter((d) => d.exists && usable(d.data())).map((d) => card(d.id, d.data(), { friend: mine.has(d.id) }))) };
}

const friendSuggestions = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return suggestionsCore(request.auth.uid);
});
const matchContacts = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return matchCore(request.auth.uid, request.data && request.data.hashes);
});

// ─── Messagerie : résumé de chaque conversation, pour la liste « Messages » ───
// Écrit par le serveur seulement (les règles interdisent ces champs aux clients) : membres (pour la requête
// « mes conversations »), dernier message (aperçu de 120 caractères, auteur, heure, type) et prénom/photo des deux
// participants. La date de lecture de chacun (lastRead) reste écrite par l'app.
async function summarizeChat(chatId) {
  const ref = db().collection("chats").doc(chatId);
  const chat = await ref.get();
  if (!chat.exists) return null;
  const members = Object.keys(chat.data().participants || {}).filter(Boolean).slice(0, 2);
  const last = (await ref.collection("messages").orderBy("createdAt", "desc").limit(1).get()).docs[0];
  const users = members.length ? await db().getAll(...members.map((u) => db().collection("users").doc(u))) : [];
  const who = {};
  users.forEach((d) => { if (d.exists) who[d.id] = { name: String(d.data().name || "Habitant").slice(0, 40), photoUrl: d.data().photoUrl || null }; });
  const out = { members, who };
  if (!chat.data().startedAt) out.startedAt = chat.createTime || FieldValue.serverTimestamp();
  if (last) {
    const m = last.data();
    Object.assign(out, { lastAt: m.createdAt || FieldValue.serverTimestamp(), lastText: String(m.text || "").slice(0, 120), lastFrom: m.fromUid || null, lastType: m.type === "poll" ? "poll" : "text" });
  }
  await ref.set(out, { merge: true });
  return out;
}
const onChatMessageSummary = onDocumentCreated({ document: "chats/{chatId}/messages/{msgId}", region: "europe-west1" }, async (event) => {
  await summarizeChat(event.params.chatId);
});
// Conversation ouverte (pas encore de message) : prénoms et photos tout de suite, pour la liste « Messages ».
const onChatCreatedSummary = onDocumentCreated({ document: "chats/{chatId}", region: "europe-west1" }, async (event) => {
  await summarizeChat(event.params.chatId);
});
// Conversations antérieures à cette mise à jour : résumées une fois, automatiquement après le déploiement.
const CHATS_VERSION = 2;   // 2 : aussi les conversations ouvertes sans message (startedAt)
async function backfillChatsIfNeeded() {
  const cfg = db().collection("config").doc("chatSummary");
  const c = await cfg.get();
  if (c.exists && (c.data().version || 0) >= CHATS_VERSION) return { skipped: true };
  let n = 0;
  for (const d of (await db().collection("chats").get()).docs) { if (!Array.isArray(d.data().members) || !d.data().startedAt) { await summarizeChat(d.id); n++; } }
  await cfg.set({ version: CHATS_VERSION, chats: n, at: FieldValue.serverTimestamp() });
  return { chats: n };
}
const chatsAutoSync = onSchedule({ schedule: "every 10 minutes", region: "europe-west1", timeoutSeconds: 540, retryCount: 0 }, async () => {
  await backfillChatsIfNeeded();
});

module.exports = { friendSuggestions, matchContacts, onChatMessageSummary, onChatCreatedSummary, chatsAutoSync, _t: { suggestionsCore, matchCore, summarizeChat, backfillChatsIfNeeded } };
