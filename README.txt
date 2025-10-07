BuddhaCollege App — Setup
=================================

FILES
- index.html        Main UI (mobile-first)
- style.css         Styles (themes + font sizes)
- firebase.js       Firebase init + EmailJS keys + theme helpers
- app.js            App logic (posts, history, donate, events, records)
- sw.js             Service worker for offline cache
- firestore.rules   Copy into Firestore Rules tab

REQUIREMENTS
- Firebase: Auth (Email/Password), Firestore, Storage
- EmailJS: public key + service + template (vars: title, body, url, to_email)

STEPS
1) Open firebase.js and fill FIREBASE_CONFIG with your project's keys.
2) Fill EMAILJS_PUBLIC_KEY / SERVICE_ID / TEMPLATE_ID.
3) Firebase Console > Firestore Rules: paste firestore.rules and Publish.
4) Firebase Auth > Users > Add an admin user (email/password).
5) Run a local server (modules require http:). Example:
   - Python 3:  python -m http.server 5500
   - Node:      npx serve
   Then open:   http://localhost:5500/
6) Optional: deploy to Firebase Hosting or GitHub Pages.
7) Admin login from the Admin tab to publish posts, upload QR, add events, and manage yearly records.

NOTES
- Guests can browse everything except personal records (admin-only).
- Posts notify subscribers via EmailJS one-by-one.
- Theme & font-size are saved in localStorage (light/dark/warm; small/base/large).
