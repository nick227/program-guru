-- Exactly one target is non-null (existing CHECK); each active target participates in one unique key.
-- Fail on pre-existing duplicates instead of silently deleting attachment IDs referenced by clients.
ALTER TABLE `MediaAttachment`
  ADD UNIQUE INDEX `MediaAttachment_mediaId_programId_purpose_key` (`mediaId`, `programId`, `purpose`),
  ADD UNIQUE INDEX `MediaAttachment_mediaId_activityRevisionId_purpose_key` (`mediaId`, `activityRevisionId`, `purpose`),
  ADD UNIQUE INDEX `MediaAttachment_mediaId_instructionId_purpose_key` (`mediaId`, `instructionId`, `purpose`),
  ADD UNIQUE INDEX `MediaAttachment_mediaId_resultEntryId_purpose_key` (`mediaId`, `resultEntryId`, `purpose`),
  ADD UNIQUE INDEX `MediaAttachment_mediaId_userProfileId_purpose_key` (`mediaId`, `userProfileId`, `purpose`);
