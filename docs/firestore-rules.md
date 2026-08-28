# Firestore Security Rules — Activity Heartbeat

Paste the block below into **Firebase Console → Firestore Database → Rules**, added alongside the project's existing rules (e.g. the `users/{uid}` match block) — do not replace the whole ruleset with this.

```
match /activity/{installId} {
  allow read: if request.auth != null && request.auth.token.email == 'mzveasper@gmail.com';
  allow create, update: if request.resource.data.keys().hasOnly(['lastSeen', 'appVersion'])
    && request.resource.data.lastSeen == request.time
    && request.resource.data.appVersion is string;
  allow delete: if false;
}
```

## Notes

- A single `allow read` rule covers both `get` and `list` requests. This matters because the DAU/MAU dashboard's `getCountFromServer` aggregation is evaluated as a list-style read, so it is gated by the same rule as reading a single document.
- `request.resource.data.lastSeen == request.time` forces a genuine server timestamp on every write — it blocks backdated or future-dated spoofed heartbeats, since a client cannot set `lastSeen` to anything other than the server's own request time.

## Prerequisite

The dev dashboard read only succeeds when Gradd is signed in with Google as `mzveasper@gmail.com`. Use the "Sign in with Google" button in the dev-only Settings panel to authenticate. This is a hard requirement, not optional polish — without it, the panel shows a permission-denied error.
