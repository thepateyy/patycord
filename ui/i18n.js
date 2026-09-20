// Minimal in-app i18n — no external library, just a flat key->string
// dictionary per language with simple {placeholder} interpolation. Matches
// the rest of the app's "vendor everything, no bundler" approach.

export const LANGUAGES = { en: 'English', hu: 'Magyar' };

const translations = {
  en: {
    'username.prompt': 'What should people see when you call them?',
    'username.placeholder': 'your name',
    'username.continue': 'Continue',

    'settings.title': 'Settings',
    'settings.yourName': 'Your name',
    'settings.save': 'Save',
    'settings.yourId': 'Your ID (share this to let others join you)',
    'settings.copy': 'Copy',
    'settings.copied': 'Copied!',
    'settings.audio': 'Audio',
    'settings.noiseSuppression': 'Noise suppression',
    'settings.noiseSuppressionDesc': 'Filters background noise from your mic',
    'settings.language': 'Language',
    'settings.connecting': 'connecting…',

    'update.bannerDefault': 'A new version of patycord is available.',
    'update.available': "patycord {version} is available (you're on {current}).",
    'update.button': 'Update & restart',
    'update.updating': 'Updating…',
    'update.failed': 'Update failed: {error}',

    'whatsNew.title': "You're now on patycord {version}.",
    'whatsNew.dismiss': 'Got it',

    'sidebar.addFriend': 'Add a friend',
    'sidebar.theirId': 'their ID',
    'sidebar.add': 'Add',
    'sidebar.pending': 'Pending',
    'sidebar.friends': 'Friends ({count} in call)',
    'sidebar.noFriends': 'No friends added yet — add one above.',
    'sidebar.waiting': 'Waiting…',
    'sidebar.cancelRequest': 'Cancel request',
    'sidebar.remove': 'Remove',
    'sidebar.call': 'Call',
    'sidebar.hangUp': 'Hang up',
    'sidebar.cancel': 'Cancel',

    'main.notInCall': 'Not in a call — pick a friend on the left and hit Call.',
    'main.connecting': 'connecting…',
    'main.volume': 'Volume',
    'main.mute': 'Mute',
    'main.unmute': 'Unmute',
    'main.shareScreen': 'Share screen',
    'main.stopSharing': 'Stop sharing',
    'main.activityLog': 'Activity log',

    'chat.placeholder': 'Message',
    'chat.send': 'Send',
    'chat.close': 'Close',
    'chat.you': 'You',
    'sidebar.chat': 'Chat',

    'incomingCall.label': 'Incoming call',
    'friendRequest.label': 'Friend request',
    accept: 'Accept',
    decline: 'Decline',
    unknown: 'Unknown',
    anonymous: 'Anonymous',
    them: 'them',

    'toast.friendDeclined': '{name} declined your friend request',
    'toast.callFailed': 'Call with {name} failed: {error}',
    'toast.friendAccepted': '{name} accepted your friend request',
    'toast.mutualAdd': "You and {name} added each other — now friends",
    'toast.addedFriend': 'Added {name} as a friend',
    'toast.screenShareStarted': '{name} started sharing their screen',
    'toast.screenShareFailed': 'Screen share failed: {error}',
    'toast.micFailed': 'Microphone access failed: {error} — check your mic is connected and restart patycord',
    'toast.notOnline': "{name} isn't online right now.",
    'toast.connectionError': 'Connection error: {error}',
    'toast.reconnecting': 'Lost connection to the signaling server, reconnecting…',
    'toast.newMessage': 'New message from {name}',

    'log.disconnected': 'disconnected from {id}',
    'log.joining': '{name} is joining the call',
    'log.sharingScreen': 'sharing your screen',
    'log.stoppedSharing': 'stopped sharing your screen',
    'log.rnnoiseFailed': 'RNNoise failed to load, falling back to built-in suppression: {error}',
    'log.micSettings': 'mic settings: {json}',
    'log.rnnoiseActive': 'noise suppression: RNNoise (local, open-source ML model)',
    'log.ready': 'ready — press Call next to a friend to connect',
    'log.incomingCall': 'incoming call from {name}',
    'log.peerError': 'peer error: {error}',
    'log.friendRequestSent': 'friend request sent to {name}',
    'log.updateCheckFailed': 'update check failed: {error}',

    'myId.micNeeded': 'mic access needed',
    'screen.label': "{name}'s screen",
  },
  hu: {
    'username.prompt': 'Mit lássanak mások, amikor hívod őket?',
    'username.placeholder': 'a neved',
    'username.continue': 'Tovább',

    'settings.title': 'Beállítások',
    'settings.yourName': 'A neved',
    'settings.save': 'Mentés',
    'settings.yourId': 'Az azonosítód (oszd meg, hogy mások csatlakozhassanak)',
    'settings.copy': 'Másolás',
    'settings.copied': 'Másolva!',
    'settings.audio': 'Hang',
    'settings.noiseSuppression': 'Zajszűrés',
    'settings.noiseSuppressionDesc': 'Kiszűri a háttérzajt a mikrofonodból',
    'settings.language': 'Nyelv',
    'settings.connecting': 'csatlakozás…',

    'update.bannerDefault': 'Új patycord-verzió érhető el.',
    'update.available': 'A patycord {version} elérhető (jelenleg a(z) {current} verziót használod).',
    'update.button': 'Frissítés és újraindítás',
    'update.updating': 'Frissítés…',
    'update.failed': 'A frissítés sikertelen: {error}',

    'whatsNew.title': 'Sikeres frissítés! Mostantól a patycord {version} verziót használod.',
    'whatsNew.dismiss': 'Rendben',

    'sidebar.addFriend': 'Barát hozzáadása',
    'sidebar.theirId': 'barátod azonosítója',
    'sidebar.add': 'Hozzáadás',
    'sidebar.pending': 'Függőben',
    'sidebar.friends': 'Barátok ({count} hívásban)',
    'sidebar.noFriends': 'Még nincs hozzáadott barátod — adj hozzá egyet fent.',
    'sidebar.waiting': 'Várakozás…',
    'sidebar.cancelRequest': 'Kérés visszavonása',
    'sidebar.remove': 'Eltávolítás',
    'sidebar.call': 'Hívás',
    'sidebar.hangUp': 'Hívás befejezése',
    'sidebar.cancel': 'Mégse',

    'main.notInCall': 'Nem vagy hívásban — válassz ki egy barátot a bal oldalon, és nyomd meg a Hívás gombot.',
    'main.connecting': 'csatlakozás…',
    'main.volume': 'Hangerő',
    'main.mute': 'Némítás',
    'main.unmute': 'Némítás feloldása',
    'main.shareScreen': 'Képernyőmegosztás',
    'main.stopSharing': 'Megosztás leállítása',
    'main.activityLog': 'Napló',

    'chat.placeholder': 'Üzenet',
    'chat.send': 'Küldés',
    'chat.close': 'Bezárás',
    'chat.you': 'Te',
    'sidebar.chat': 'Csevegés',

    'incomingCall.label': 'Bejövő hívás',
    'friendRequest.label': 'Barátkérés',
    accept: 'Elfogadás',
    decline: 'Elutasítás',
    unknown: 'Ismeretlen',
    anonymous: 'Névtelen',
    them: 'ő',

    'toast.friendDeclined': '{name} elutasította a barátkérésedet',
    'toast.callFailed': 'A hívás nem sikerült ({name}): {error}',
    'toast.friendAccepted': '{name} elfogadta a barátkérésedet',
    'toast.mutualAdd': 'Te és {name} kölcsönösen hozzáadtátok egymást — mostantól barátok vagytok',
    'toast.addedFriend': '{name} hozzáadva barátként',
    'toast.screenShareStarted': '{name} elkezdte megosztani a képernyőjét',
    'toast.screenShareFailed': 'Nem sikerült elindítani a képernyőmegosztást: {error}',
    'toast.micFailed': 'Nem sikerült hozzáférni a mikrofonhoz: {error} — ellenőrizd, hogy csatlakoztatva van-e a mikrofon, majd indítsd újra a patycordot',
    'toast.notOnline': '{name} jelenleg nincs online.',
    'toast.connectionError': 'Kapcsolódási hiba: {error}',
    'toast.reconnecting': 'Megszakadt a kapcsolat a jelzésszerverrel, újracsatlakozás…',
    'toast.newMessage': 'Új üzenet tőle: {name}',

    'log.disconnected': 'megszakadt a kapcsolat vele: {id}',
    'log.joining': '{name} csatlakozik a híváshoz',
    'log.sharingScreen': 'megosztod a képernyődet',
    'log.stoppedSharing': 'leállítottad a képernyőmegosztást',
    'log.rnnoiseFailed': 'Az RNNoise betöltése sikertelen, visszaváltás a beépített zajszűrésre: {error}',
    'log.micSettings': 'mikrofon beállításai: {json}',
    'log.rnnoiseActive': 'zajszűrés: RNNoise (helyi, nyílt forráskódú ML modell)',
    'log.ready': 'készen áll — válassz egy barátot, és nyomd meg a Hívás gombot a csatlakozáshoz',
    'log.incomingCall': 'bejövő hívás tőle: {name}',
    'log.peerError': 'kapcsolati hiba: {error}',
    'log.friendRequestSent': 'barátkérés elküldve neki: {name}',
    'log.updateCheckFailed': 'a frissítés keresése sikertelen: {error}',

    'myId.micNeeded': 'mikrofon-hozzáférés szükséges',
    'screen.label': '{name} képernyője',
  },
};

let currentLang = null;

export function getLanguage() {
  if (currentLang) return currentLang;
  const saved = localStorage.getItem('patycord.language');
  currentLang = saved && translations[saved] ? saved : 'en';
  return currentLang;
}

export function setLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem('patycord.language', lang);
}

export function t(key, vars) {
  const lang = getLanguage();
  let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
  }
  return str;
}

// For static markup that renderer.js doesn't rebuild itself — everything it
// does generate dynamically calls t() directly in its own template strings.
export function applyStaticTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
