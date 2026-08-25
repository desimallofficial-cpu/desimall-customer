DESIMALL CUSTOMER CLEAN v1.0.2 — TRACKING AUTH FIX

EXACT ROOT CAUSE
The backend tracking endpoint is now correct and returns 401:
  "Supabase access token required."

Customer Track Order was not loading js/auth.js, and tracking-clean.js looked for:
  desimall_session.access_token

But the real DesiMall customer auth system stores:
  desimall_session.accessToken

Therefore the logged-in customer's Bearer token was not being sent.

FIX
- Track Order now loads auth.js before api.js.
- tracking-clean.js uses DesiMallAuth.getAccessToken().
- It also supports both accessToken and access_token.
- Session refresh is attempted before the tracking request.
- Cache-bust version bumped to 1.0.2.

UPLOAD
GitHub desimall-customer:
Upload/replace COMPLETE contents of this ZIP.

Commit:
Fix tracking auth token v1.0.2

After Render is Live:
1. Open Track Order.
2. Ctrl+Shift+R once.
3. Bottom-right should show Customer Clean v1.0.2.
4. Network request "tracking" should no longer be 401.

If the stored customer session itself has expired and cannot refresh, log out and log in once.
