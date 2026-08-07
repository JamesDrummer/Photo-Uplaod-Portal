# Trusted missing-media reconciliation

Guest browsers must never delete upload rows. A missing Storage object is hidden locally when its image or video fails to load; this makes James's manual Storage deletions disappear from the gallery immediately while retaining a recoverable stale table row.

A future reconciler must run only in a trusted server-side or administrator context with the Supabase service role. Do not expose that credential to this Vite application.

## Safe reconciliation algorithm

1. Default every invocation to **dry-run**; require an explicit option to apply changes.
2. Complete a successful listing of both the `guest-media` Storage bucket and the `uploads` table. If either listing is incomplete or fails, make no mutations.
3. For each row whose object is absent, set `missing_since` on the first successful confirmed check. Do not delete it.
4. Clear `missing_since` and its confirmation count if the object reappears.
5. Record successful independent confirmations. Delete a row only after at least **two successful checks** have confirmed absence and at least **15 minutes** have elapsed since `missing_since`.
6. Log identifiers and outcomes, but never credentials or the event password.

The schema, scheduled job and service-role configuration are deliberately not implemented for the wedding-day release. Guest-side hiding is sufficient for tomorrow and stale rows remain recoverable.
