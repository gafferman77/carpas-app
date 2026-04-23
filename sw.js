self.importScripts("https://www.gstatic.com/firebasejs/11.7.1/firebase-app-compat.js");
self.importScripts("https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging-compat.js");

const firebaseConfig = {
    apiKey: "AIzaSyDlsbXBrkzmpEJTLP2l8e77te63yXAlutw",
    authDomain: "agenda-roots-v2.firebaseapp.com",
    projectId: "agenda-roots-v2",
    storageBucket: "agenda-roots-v2.firebasestorage.app",
    messagingSenderId: "60615586442",
    appId: "1:60615586442:web:72e18c5984a5412ca77373"
};

const hasFirebaseConfig = !Object.values(firebaseConfig).some((value) => String(value).startsWith("REEMPLAZAR_"));
if (hasFirebaseConfig && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

if (hasFirebaseConfig && firebase.messaging && typeof firebase.messaging === "function") {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
        const title = payload?.notification?.title || "Agenda";
        const body = payload?.notification?.body || "Tienes una notificacion nueva.";
        const tag = payload?.notification?.tag || payload?.data?.tag || "agenda-push";
        self.registration.showNotification(title, {
            body,
            tag,
            data: payload?.data || {}
        });
    });
}

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            if (clients.length > 0) {
                return clients[0].focus();
            }
            return self.clients.openWindow("./");
        })
    );
});
