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
const { getFirestore } = require("firebase-admin/firestore");

const db = () => getFirestore();
const MAX_FRIENDS = 40, MAX_RESULTS = 10, MAX_HASHES = 500;
const card = (uid, u, extra) => ({ uid, name: String(u.name || "Habitant").slice(0, 40), photoUrl: u.photoUrl || null, ...extra });
const usable = (u) => u && (!u.role || u.role === "user") && u.discoverable !== false;

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
  return { suggestions: out.slice(0, MAX_RESULTS) };
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
  return { matches: docs.filter((d) => d.exists && usable(d.data())).map((d) => card(d.id, d.data(), { friend: mine.has(d.id) })) };
}

const friendSuggestions = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return suggestionsCore(request.auth.uid);
});
const matchContacts = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connecte-toi.");
  return matchCore(request.auth.uid, request.data && request.data.hashes);
});

module.exports = { friendSuggestions, matchContacts, _t: { suggestionsCore, matchCore } };
