# Media integration for the frontend and SDK

For: the frontend agent (owner of frontend media architecture and the SDK hooks). Server owner: Claude.
Verified against a running API and worker by `pnpm --filter server media:e2e` (19/19 checks).
Requirements: `docs/specs/11-MEDIA.md`, `03-UX.md` §6 and §8. Operations: `packages/api-spec/openapi.yaml`, tag `media`.

## 1. Upload

```
POST /media/uploads                      { filename, mime, sizeBytes, alt? }  → UploadTicket
PUT  ticket.uploadUrl                    raw bytes, headers exactly ticket.headers
POST /media/uploads/{uploadId}/complete  → MediaAsset (state PROCESSING)
```

- `mime` may carry codec parameters straight from `MediaRecorder` (`video/webm;codecs=vp8,opus`); the server keeps the type only. Accepted: `image/jpeg|png|webp|heic`, `video/mp4|quicktime|webm`, `audio/mpeg|mp4|webm|ogg`.
- Send the PUT with **`ticket.headers` and nothing else**. Locally the URL is the API (`/media/uploads/{id}/content?token=…`, `content-type: application/octet-stream`); with R2 it is a presigned storage URL and `content-type` must equal the declared MIME. Do not send cookies or `Authorization` to it.
- `ticket.maxBytes` is the server's limit for that type: check before uploading. Over-limit uploads fail with `400 VALIDATION_ERROR`.
- `complete` checks the bytes against the declared type (magic numbers). A mismatch is `400` and the asset becomes `FAILED`. Calling `complete` twice is safe.
- The upload window is one hour. An upload never completed becomes `FAILED` and its bytes are deleted.

## 2. Processing → READY

The worker turns every upload into served renditions. Until then:

| `state` | Meaning | UI |
|---|---|---|
| `UPLOADING` | Ticket issued, bytes not verified | Progress from the PUT |
| `PROCESSING` | Worker is transcoding | Placeholder tile; `thumbnailUrl` is `null`; `GET /media/{id}/url` is `400` |
| `READY` | Renditions exist | Show it |
| `FAILED` | Undecodable or abandoned | "Couldn't process this file" + retry by uploading again |

Poll `GET /media/{id}` (owner only) until `READY` or `FAILED`. Photos take about a second, short videos a few seconds; back off to 2–3 s. There is no push channel in P1.

What the worker produces:

| Type | Served as | Notes |
|---|---|---|
| Photo | `image/jpeg` (max 2048 px) + 480×480 thumbnail | Re-encoded: EXIF and GPS removed. The original upload is never served |
| Video | `video/mp4` H.264/AAC, max 1280 px, faststart + JPEG poster + thumbnail | WebM/VP8/VP9/Opus recordings and phone MP4s both work; location metadata removed |
| Audio | `audio/mp4` AAC | WebM/Opus, M4A, and MP3 inputs; no thumbnail (`thumbnailUrl` points at the audio) |

## 3. Playback URLs

- Every `thumbnailUrl`, `coverUrl`, `avatarUrl`, `posterUrl`, and `GET /media/{id}/url` result is a **signed URL**, issued only after the server checked the viewer's access. Use it directly in `<img>`, `<video>`, `<audio>`; it needs no cookies. The one exception: media inside a viewer's own unpublished Activity or Program draft is re-checked against the session cookie, which same-site `<img>`/`<video>` requests send automatically.
- A signed URL is a **bearer capability** valid for one to two hours (`expiresAt`). Do not persist it (no localStorage, no long-lived cache). It is bound to the viewer it was issued to and stops working as soon as access is revoked, the viewer is blocked, or group membership ends. On a `404` from a media URL, refetch the parent query or call `GET /media/{id}/url` again.
- For video use `url` as `src` and `posterUrl` as `poster`. Byte-range requests work (`206`, `Accept-Ranges: bytes`), so seeking works without downloading the whole file. The API proxies both local and R2 storage (no redirect), so every fetch, including each range request, re-checks access; responses are `Cache-Control: private, no-store`.
- `GET /media/{id}/url` works for anonymous viewers when the media is public or platform media; send the session cookie otherwise.

## 4. Who sees what

| Situation | Owner | Group member | Other signed-in user | Anonymous |
|---|---|---|---|---|
| Private (default after upload, or attached to a result) | Yes | No | No | No |
| `audience: GROUP` publication | Yes | Yes, while an active member | No | No |
| `audience: PUBLIC`, `PENDING` (contribution under review) | Yes | No | No | No |
| `audience: PUBLIC`, `APPROVED` | Yes | Yes | Yes | Yes |
| Revoked, deleted, or moderated | No URL is issued; existing URLs stop at expiry | | | |

Denials are `404`, never `403`, so private media is not revealed to exist. Attaching media (`POST /media-attachments`) never changes who can see it; only publishing does.

## 5. The Activity page rows

From `GET /calendar-items/{itemId}/occurrence`:

- **My Media** (`myMedia`): the user's own media attached to results of this Activity (`target.kind = RESULT_ENTRY`, `purpose = JOURNAL`). To add one: upload → wait for READY → `POST /media-attachments` with the result entry id from `POST /sessions/{id}/results`.
- **Shared Media** (`sharedMedia`): `GROUP` publications for this occurrence. Share with `POST /media-publications { mediaId, audience: 'GROUP', groupId, occurrenceKey }` (`occurrenceKey` is `collaborators.occurrenceKey`). Comments exist only here (`/media-publications/{id}/comments`). The row is empty and should be hidden when there is no group.
- **Community Media** (`communityMedia`): approved public media for this Activity across Programs, the current Program creator's first. Likes and views apply (`POST /media-publications/{id}/likes`, `…/views` on qualified playback only, never on thumbnail render). No comments on public media in P1.

Publishing publicly (`audience: PUBLIC`) requires `license` and lands as `PENDING` until a moderator approves it; tell the user it is under review.

## 6. Errors to handle

| Response | When |
|---|---|
| `400 VALIDATION_ERROR` | Bad type or size, content mismatch on complete, media not READY yet |
| `404 NOT_FOUND` | No access, deleted, or expired/forged signed URL |
| `409 CONFLICT` | Reused idempotency key with a different request (comments, reactions) |
| `416` | Range beyond the end of a file (media elements handle this) |
| `429 RATE_LIMITED` | Back off using `retry-after` |

## 7. Environment notes

- Locally, storage is a directory (`STORAGE_DIR`, default `<repo>/uploads`) that the API and worker must share: run both from the same checkout or set the same `STORAGE_DIR` for both.
- In production `STORAGE_PROVIDER=r2` is mandatory (the API refuses local storage when `NODE_ENV=production`). The R2 bucket needs a CORS rule allowing `PUT` from the web origin with the `content-type` header, or direct browser uploads fail.
- Server tests empty their database before every test. Point any other test runner at its own database (`scripts/local-mysql.sh create-database programs_app_<name>`, then `TEST_DATABASE_URL`) rather than sharing `programs_app_test`.
