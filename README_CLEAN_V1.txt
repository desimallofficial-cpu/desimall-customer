DESIMALL CUSTOMER CLEAN v1.0

THIS IS THE FRESH CUSTOMER FRONTEND BASE.

WHAT IS KEPT
- Existing login/session/customer pages.
- Cart / checkout / orders.
- Mandatory exact delivery GPS before order placement.
- Saved address latitude + longitude.
- Existing backend API compatibility.

WHAT IS REBUILT CLEAN
- Track Order page.
- One tracking script only: js/tracking-clean.js
- One tracking stylesheet only: css/tracking-clean.css
- No old v0.31.x tracking badge/version patch logic.
- Fresh service worker with network-first HTML/JS/CSS.

LIVE TRACKING RULES
- Tez: rider -> customer live route + moving bike marker.
- Food: delivery partner -> customer live route.
- Service: service partner -> customer live route.
- Try-On: try-on agent -> customer live route.
- Normal DesiMall: delivery tracking can show rider route when backend supplies live delivery GPS.
- Map stops after Delivered/Completed.
- ETA is capped at 25 minutes on customer display.
- OTP remains visible until final delivery/completion.

DEPLOY
1. Open GitHub desimall-customer.
2. Upload/replace COMPLETE CONTENTS of this ZIP.
3. Commit:
   DesiMall Customer Clean v1.0
4. Let Render auto-deploy.
5. Do one Ctrl+Shift+R after first deploy.

PROOF
Track Order bottom-right should show:
Customer Clean v1.0

IMPORTANT
This package expects Backend Clean v1.0 health:
version: 1.0.0
build: clean-v1
