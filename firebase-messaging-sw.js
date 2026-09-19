// Service worker de réception des notifications push en arrière-plan (app fermée/en fond).
// Sur iPhone, ce fichier ne s'active QUE si l'app a été ajoutée à l'écran d'accueil.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCU52SgKoIS_P-SEiXFC4d8lQ1rz5mG4to",
  authDomain: "noova-366d0.firebaseapp.com",
  projectId: "noova-366d0",
  storageBucket: "noova-366d0.firebasestorage.app",
  messagingSenderId: "710589257687",
  appId: "1:710589257687:web:946b5d1efffabff14d9d92"
});

// Version du script : v3. Activation immédiate pour que les appareils déjà abonnés passent tout de
// suite sur le nouveau comportement (une seule notification, regroupée par tag).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

// Les messages avec un bloc "notification" sont déjà affichés par le navigateur/SDK :
// les afficher aussi ici produisait deux notifications identiques. On ne gère donc que
// les messages « data seule ».
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'Noova', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: d,
    tag: d.tag || 'noova-generic'
  });
});

// Clic : on ouvre (ou on ramène) l'app en transmettant l'identifiant de la notification, pour que
// l'app compte l'ouverture une fois l'utilisateur connecté.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.url || '/app-v2';
  let go = 'home';
  try { go = new URL(url, self.location.origin).searchParams.get('go') || 'home'; } catch (e) {}
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const c = list.find((x) => 'focus' in x);
      if (c) { if (d.nid) c.postMessage({ type: 'notif-open', nid: d.nid, go }); return c.focus(); }
      return clients.openWindow(url);
    })
  );
});
