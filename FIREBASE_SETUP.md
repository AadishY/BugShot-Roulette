# Firebase Setup — Quick Reference

For the comprehensive architecture guide, security rules, and data schemas, please refer to [`FIREBASE.md`](file:///c:/Sony/bugshot/BugShot-Roulette/FIREBASE.md).

---

## Quick Setup Steps

1. **Create Web App**: In [Firebase Console](https://console.firebase.google.com/), add a Web app and copy your credentials into `.env`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

2. **Enable Authentication**:
   - Navigate to **Authentication** -> **Sign-in method**.
   - Enable **Email/Password**.

3. **Initialize Cloud Firestore**:
   - Navigate to **Firestore Database** -> **Create Database**.
   - Under **Rules**, paste the rules from [`firestore.rules`](file:///c:/Sony/bugshot/BugShot-Roulette/firestore.rules):
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /users/{username} {
           allow read, write: if true;
         }
         match /direct_messages/{messageId} {
           allow read, write: if true;
         }
         match /broadcasts/{broadcastId} {
           allow read, write: if true;
         }
         match /friend_requests/{requestId} {
           allow read, write, delete: if true;
         }
         match /{document=**} {
           allow read, write: if true;
         }
       }
     }
     ```
