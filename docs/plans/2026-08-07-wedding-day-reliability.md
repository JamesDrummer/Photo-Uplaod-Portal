# Wedding-Day Reliability Implementation Plan

> For Hermes/Codex: implement task-by-task using strict RED-GREEN-REFACTOR. Do not deploy.

Goal: Make the wedding photo portal resilient to transient media errors, mobile memory limits, partial upload failures, unsupported files and optional Turnstile failure, while preserving James's requirement that Storage-deleted media disappears from the guest gallery.

Architecture: Guest clients become non-destructive. A media load failure hides the item only in that browser. The guest gallery no longer performs database cleanup or full Storage reconciliation before rendering. Trusted table cleanup is documented as a separate server-side/admin responsibility. Upload processing becomes bounded and sequential, with clear per-file outcomes. Video processing is lazy-loaded and guarded before allocating FFmpeg/WASM memory.

Tech stack: React 18, TypeScript, Vite, Supabase JS, Vitest, Testing Library.

## Task 1: Establish the test harness

Files:
- Modify: `wedding-uploader/package.json`
- Create: `wedding-uploader/vitest.config.ts`
- Create: `wedding-uploader/src/test/setup.ts`

Steps:
1. Add Vitest, jsdom and React Testing Library dev dependencies and `test` scripts.
2. Add a minimal working test.
3. Run it and confirm the harness passes.

## Task 2: Make guest gallery behaviour non-destructive

Files:
- Modify: `wedding-uploader/src/components/GalleryItem.tsx`
- Modify: `wedding-uploader/src/components/GalleryScreen.tsx`
- Test: `wedding-uploader/src/components/GalleryItem.test.tsx`
- Test: `wedding-uploader/src/components/GalleryScreen.test.tsx`

Required behaviour:
1. Write a failing regression test proving an image/video `onError` never calls Supabase `uploads.delete`.
2. Remove all guest-side database deletion from media render failures.
3. Keep `onFileMissing` as local UI filtering only.
4. Remove pre-paint Storage-folder reconciliation and `cleanupOrphanedRecords` from the guest gallery. Fetch gallery rows and render immediately.
5. A row whose Storage object was manually deleted will fail to load and be hidden locally, so the unwanted media disappears without destructive guest writes.
6. Document that durable row cleanup must be done by a trusted server/admin reconciler with a grace period and repeated confirmation.

## Task 3: Classify and validate selections before processing

Files:
- Create: `wedding-uploader/src/utils/fileSelection.ts`
- Test: `wedding-uploader/src/utils/fileSelection.test.ts`
- Modify: `wedding-uploader/src/components/UploadScreen.tsx`

Required behaviour:
1. Write failing tests for common image, HEIC/HEIF, GIF and video MIME/extension combinations, including MOV files with blank MIME.
2. Reject unsupported files explicitly rather than silently dropping them.
3. Cap a batch at 5 files.
4. Reject source videos over 50 MB before metadata parsing or FFmpeg allocation.
5. Reject source images/GIFs over 30 MB with a clear message.

## Task 4: Bound image and upload memory

Files:
- Modify: `wedding-uploader/src/components/UploadScreen.tsx`
- Modify: `wedding-uploader/src/utils/imageConverter.ts`
- Test: `wedding-uploader/src/utils/uploadPipeline.test.ts`

Required behaviour:
1. Convert/process selected images sequentially, not with `Promise.all`.
2. Upload files sequentially, not all at once.
3. Continue after an individual file failure.
4. Preserve and report per-file success/failure results, including filenames.
5. Never report the whole batch as failed when some files succeeded.
6. Do not clear the chooser unless all selected files succeeded.
7. Release object URLs and large intermediate references promptly.

## Task 5: Make video handling safer

Files:
- Modify: `wedding-uploader/src/utils/videoConverter.ts`
- Modify: `wedding-uploader/src/components/UploadScreen.tsx`
- Test: `wedding-uploader/src/utils/videoConverter.test.ts`

Required behaviour:
1. Export a pure `needsVideoTranscode(width, height)` helper and write failing tests first.
2. Treat landscape <=1280x720 and portrait <=720x1280 as already within 720p bounds.
3. Add a timeout to metadata loading and revoke object URLs on all paths.
4. Dynamically import FFmpeg/video conversion only when a validated video is selected.
5. Clean FFmpeg virtual files in `finally` after failed conversions.
6. Keep the 50 MB pre-conversion source cap from Task 3.
7. Give guests a clear short-video error instead of freezing indefinitely.

## Task 6: Make Turnstile failure recoverable

Files:
- Modify: `wedding-uploader/src/components/PasswordScreen.tsx`
- Test: `wedding-uploader/src/components/PasswordScreen.test.tsx`

Required behaviour:
1. Keep Turnstile as the normal path.
2. After a bounded timeout or widget error, show a clear availability message and allow password-only entry. This is an availability fallback, not security authentication.
3. Do not claim Turnstile is server-verified.
4. Do not expose or log the event password.

## Task 7: Document trusted missing-media reconciliation

Files:
- Create: `docs/missing-media-reconciliation.md`
- Modify: `wedding-uploader/README.md`

Document this safe future design:
1. Run with a server-side service role, never from guest browsers.
2. List Storage and table rows.
3. Mark a row `missing_since` on the first confirmed absence.
4. Clear the marker if the object reappears.
5. Delete the row only after at least two successful checks and a 15-minute grace period.
6. Default any manual tool to dry-run.
7. For tomorrow, guest-side hiding is sufficient and leaves recoverable stale rows.

## Task 8: Verification

Commands from `wedding-uploader/`:
- `npm test -- --run`
- `npm run build`
- `npm run lint` (add a minimal ESLint config if missing)
- `npm audit --omit=dev`

Inspect:
- `git diff --check`
- no `.delete()` against `uploads` in guest components
- no production deployment/config mutation
- production remains untouched

Commit on branch `fix/wedding-day-reliability` with a concise message. Do not push or deploy until James approves the reviewed result.
