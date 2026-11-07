# MEDIA — Library, attachments, capture studio, contributions, playback

**Status:** Authoritative P1 contract · **Authority:** MediaAsset ownership, upload/capture flow, attachment permission, rendition, contribution review. Public social engagement is `12-SOCIAL.md`; Activity/Instruction only declare where media may attach.

## 1. Two principal needs

1. **Fast reuse:** user selects from platform illustrations and demonstration videos or their personal library. A seeded Activity looks complete without bespoke recording.
2. **Simple original capture:** camera recording and upload, especially at Instruction level, then keep it private, share to a group, or submit for public use. One original upload may be reused in many authorized contexts.

Capture is valuable to the creator and to the user's private progress log; do not make publishing the default. The public Activity hub is an **approved distribution surface**, not all uploaded files.

## 2. Media models

| Model | Fields | Rule |
|---|---|---|
| `MediaAsset` | id, ownerId? (null=platform), type PHOTO/VIDEO/AUDIO, originalStorageKey, mime, byteSize, width?, height?, durationMs?, checksum?, alt?, state, license?, attribution?, sourceUrl?, uploadExpiresAt?, uploadedAt?, createdAt, deletedAt? | Private file identity, not automatically published. Platform assets must record license and source. While `UPLOADING`, `uploadExpiresAt` bounds the signed upload window and completion is verified against the claimed size and type |
| `MediaVariant` | id, mediaId, variant THUMB/POSTER/STREAM/ORIGINAL/WEB, storageKey, mime, width?, height?, durationMs?, byteSize | Generated versions; controlled delivery |
| `MediaAttachment` | id, mediaId, programId?, activityRevisionId?, instructionId?, resultEntryId?, userProfileId?, purpose, position, createdAt | **Exactly one target**; rights check; doesn't grant visibility alone |
| `MediaPublication` | id, mediaId, publishedById, audience PUBLIC/GROUP, groupId?, occurrenceKey?, activityId?, instructionKey?, programId?, status PENDING/APPROVED/REJECTED/REVOKED, publishedAt?, license?, caption?, likeCount, viewCount, commentCount, rankScore, qualityReviewedAt?, reviewedById?, reviewedAt?, reviewNote? | Explicit audience + moderation, attribution. GROUP publications need no moderation review and are APPROVED on creation. A PUBLIC publication targeting an Activity is a **contribution** and enters moderation as PENDING |

### MediaAttachment referential integrity

Use explicit nullable FKs for exactly one target, plus DB CHECK; avoid `targetType + targetId` with unverified references.


Consolidated persistence: `packages/db/prisma/schema.prisma`. Enforce exactly one target by SQL CHECK e.g. `(programId IS NOT NULL) + (activityRevisionId IS NOT NULL) + (instructionId IS NOT NULL) + (resultEntryId IS NOT NULL) + (userProfileId IS NOT NULL) = 1`. If a platform asset is reused by a private Activity and public Program, attachment/audience guards remain distinct; never infer public exposure from attached targets.

## 3. Rights, ownership, audience

| Source | Can attach to private draft? | Can publish publicly? |
|---|---|---|
| Own original MediaAsset | Yes | Yes, explicit approval/rights declaration |
| Platform seed, rights-cleared with license recorded | Yes | According to seeded license/use scope |
| Someone else's private MediaAsset | No without explicit grant | No without explicit publication license |
| Group-shared MediaPublication | Group members for relevant group | Not automatically public |
| Private personal journal | Owner only | Only after explicit share flow |

A private recording remains private even when its associated Activity or Program is public. Public media can appear in a swipeable Activity hub only if approved for Activity (or Instruction) and audience. Group media may be visible only to members; views/likes apply to public publication IDs, not the private storage asset. Deleting one attachment doesn't delete asset or other attachments. Deleting asset requires reference/retention checks.

## 4. Capture UX (one decision at a time)

P1 offers **camera recording and upload**.

1. Tap `+` in tiny My Media grid or `Media` on Activity/Instruction → Media Studio.
2. Choose `Library`, `Upload`, or `Record` as large buttons.
3. `Record` opens camera preview with the relevant **instruction title/prompt** (e.g. “Demonstrate starting position”). Explain camera/mic permission only when needed; if denied, offer `Upload instead`.
4. Start recording; visible duration/status and stop control. No pressure to share or rank content.
5. Review, then `Retake` or `Save to My Media` (Private default). Visibility is a separate deliberate decision: `Only me`, `Group` if member, `Public` if eligible; public contribution needs moderation.
6. Return to the exact origin (Program/Activity/Instruction/Calendar result) with newly attached thumbnail, draft autosaved.

Trimming, thumbnail selection, framing presets, and countdowns are deferred. No body-position analysis or appearance assessment. Do not block save for aesthetics or overfit fitness-specific capture prompts.

## 5. Library and viewer UX

- **My Media**: own uploaded/captured and referenced assets, filter Photo/Video, search, recent ordering, selection and `+ Record`.
- **Platform Library**: curated rights-cleared illustrations, images, and selected demonstration videos with known license + category/tags and attribution as required; supports activity matching suggestions.
- `ThumbnailGrid`: compact ~5–6 small squares per row, no verbose titles; tile accessible with meaningful label, play icon for video, permission indicator when needed, `+` control.
- Tap tile → single `MediaViewer` with swipe/next/prev, author avatar/credit, video controls, concise likes/views for public media and comments for group-shared media; leave returns to same Activity and scroll state. No “More demonstrations” secondary wall of copy.
- **Public media order:** current Program creator's eligible selected media first, then remaining approved publications by `rankScore`, which combines popularity (likes, qualified views) with relevance, quality review, and safety. Popularity alone never decides: unreviewed items are capped, moderated items are excluded, repeated contributions from one creator are capped. Hide duplicates and blocked/removed content. Support paging/next cursor and error/offline states.

## 6. Processing and storage

1. Client requests `POST /media/uploads` with filename/type/size/checksum (claimed).
2. Server checks quota, auth, MIME allow-list, max size/duration, issues short-lived signed upload URL/session; never exposes private storage read URL.
3. Client PUTs multipart as appropriate, `POST /media/uploads/:id/complete` verifies actual content size/MIME/identity.
4. Worker pipeline: malware scan where feasible, EXIF/GPS stripping for distribution, image variants, ffmpeg transcode to H.264 MP4 (browsers record different formats) with poster and thumbnail, audio processing; mark READY or FAILED with retry.
5. Asset-only storage remains owner-private. `POST /media-attachments` checks target ownership/permission and READY state.
6. `POST /media-publications` checks audience, license, moderation, target mapping, group membership; distribute via CDN/public variant or signed audience URL.
7. Revoke or moderate: remove from discovery, viewer, CDN cache, delivery URLs; preserve owner copy/history according to policy.

Store timestamps/byte sizes, perceptual/cryptographic hashes for duplicate/upload integrity as appropriate; never make hash or original path public. Private CDN signed URLs short-lived and bound to authorization; require origin download check. Group access removal invalidates future signed links quickly.

## 7. Public Activity hub / contribution workflow

A contribution is a PUBLIC `MediaPublication` with `activityId` (and optional `instructionKey`); there is no separate contribution record.

Creator selects owned media → choose `Contribute to Activity` from viewer or Activity Detail → target canonical Activity/optional Instruction → confirm PUBLIC + display license + caption → media publication `PENDING` → moderator approves or rejects (`POST /moderation/publications/:id`) → included in shared Activity carousel/grid; engagements accrue on MediaPublication. A program-sourced video may be eligible if author explicitly permits Activity-level public discoverability. **Do not automatically pool all videos from all 100 Programs**: private/paid/attribution/scope restrictions still apply.

A contribution may be rejected without deleting the submitter's source asset; creator can edit/retry. Approved contribution doesn't permit target creator to overwrite original media or assume ownership.

## 8. DTOs

```ts
interface MediaThumbDto { id:string; thumbnailUrl:string; type:'PHOTO'|'VIDEO'|'AUDIO';
  durationMs?:number|null; alt:string; canSelect:boolean; }
interface PublicMediaThumbDto extends MediaThumbDto { publicationId:string; creator:UserSummaryDto;
  likes:number; views:number; }
interface RequestUploadDto { filename:string; mime:string; sizeBytes:number; checksum?:string; }
interface UploadTicketDto { uploadId:string; method:'PUT'|'MULTIPART'; uploadUrl:string;
  expiresAt:string; headers?:Record<string,string>; }
interface MediaAssetDto { id:string; type:string; state:string; variants:MediaThumbDto[];
  createdAt:string; attachmentCount:number; isOwner:boolean; }
interface AttachMediaDto { mediaId:string; target:{kind:'PROGRAM'|'ACTIVITY_REVISION'|'INSTRUCTION'|'RESULT_ENTRY'|'PROFILE'; id:string};
  purpose:'COVER'|'DEMONSTRATION'|'ILLUSTRATION'|'JOURNAL'|'AVATAR'|'OTHER'; position?:number; }
interface PublishMediaDto { mediaId:string; audience:'PUBLIC'|'GROUP'; groupId?:string; occurrenceKey?:string;
  activityId?:string; instructionKey?:string; programId?:string; license?:string; caption?:string; }
interface ModeratePublicationDto { decision:'APPROVE'|'REJECT'; note?:string; }
```

## 9. DAO/services/endpoints

```ts
interface MediaDao {
  createUploadingAsset(userId:string,input:RequestUploadDto,expiresAt:Date,db:Db):Promise<MediaAssetRow>;
  markReady(mediaId:string,variants:VariantWrite[],db:Db):Promise<void>;
  listMine(userId:string,query:MediaQuery,page:Page,db:Db):Promise<PageOf<MediaAssetRow>>;
  attach(mediaId:string,target:AttachmentTarget,purpose:string,db:Db):Promise<MediaAttachmentRow>;
  detach(attachmentId:string,db:Db):Promise<void>;
  publish(input:PublicationWrite,db:Db):Promise<PublicationRow>;
  listPublicForCanonicalActivity(activityId:string,page:Page,db:Db):Promise<PageOf<PublicationRow>>;
  revoke(publicationId:string,db:Db):Promise<void>;
}
```

`UploadService`: tickets and validation. `MediaPipeline`: conversions/variants. `MediaLibraryService`: browsing/rights. `MediaAttachmentService`: owner/target and ordering. `MediaPublicationService`: audience, contribution, moderation and public links. Browser recorder implementation stays UI-side.

Routes: `GET /media/mine`, `GET /media/platform`, `POST /media/uploads`, `POST /media/uploads/:id/complete`, `GET /media/:id`, `GET /media/:id/url`, `DELETE /media/:id`, `POST /media-attachments`, `DELETE /media-attachments/:id`, `POST /media-publications`, `GET|DELETE /media-publications/:id`, `PATCH /media/:id` (alt text), `GET /moderation/publications`, `POST /moderation/publications/:id`, `GET /activities/:id/public-media`.

## 10. P1 defaults and policy constraints

Photo/video required, audio optional. Every seeded Activity has a rights-cleared illustration, with selected demonstration videos, rather than presenting empty thumbnails. Max upload size/duration are operational config; UI displays limits returned by server, not fabricated fixed limits. Default private. Publication asks audience only once, near save/share. No facial analysis, body-image scoring, automatic recording, or automatic social posting. Support captions/alt text, accessibility, explicit creator credit, and copyright reporting/takedown.

## 11. Acceptance tests

- Upload/camera capture success, denied permissions fallback to Upload, processing failure/retry.
- Every platform asset has a recorded license and source.
- Attaching original media to three allowed targets retains one MediaAsset; deleting one attachment retains others.
- User's private camera video never appears on public Activity hub until explicitly approved.
- Shared to group: nonmember access denied; member removed loses access to newly issued URLs.
- Different Program video mapped to same canonical Activity is shown only when eligible/public/licensed; no private Program leaks.
- Small thumbnails and swipe viewer keyboard/touch accessible; views count from qualifying playback, not thumbnail impressions.
- Original metadata (including GPS) not exposed to public; signed URL expiry, MIME checks, quotas, idempotency.
