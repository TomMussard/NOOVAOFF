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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app-v2';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
