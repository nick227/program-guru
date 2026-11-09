-- Version-independent group occurrence keys (10-COLLABORATION.md §2): members of one group may follow
-- different versions of its Program. Legacy keys `programVersionId:scheduleItemId:cycleIndex` become
-- `programId:activityId:programDayIndex:ordinal`, where programDayIndex = cycleIndex * cycleLength +
-- relativeDay and ordinal ranks the placement among the same Activity on the same relative day by
-- (position, id). Must match `occurrenceKey`/`sameDayOrdinals` in apps/server/src/domains/calendar/materialize.ts.
-- Data only and forward only: rewrites the group overlay key, never dates, statuses, sessions or results.
-- Only three-part (legacy) keys are touched, so re-running is a no-op.

UPDATE `CalendarItem` t
JOIN (
  SELECT si.`id` AS sid, si.`programVersionId` AS vid, v.`programId` AS pid, si.`activityId` AS aid, si.`relativeDay` AS rd,
         COALESCE(v.`durationDays`, v.`cycleDays`, 7) AS len,
         ROW_NUMBER() OVER (PARTITION BY si.`programVersionId`, si.`activityId`, si.`relativeDay` ORDER BY si.`position`, si.`id`) - 1 AS ord
  FROM `ProgramScheduleItem` si
  JOIN `ProgramVersion` v ON v.`id` = si.`programVersionId`
) s
  ON s.vid = SUBSTRING_INDEX(t.`groupOccurrenceKey`, ':', 1)
 AND s.sid = SUBSTRING_INDEX(SUBSTRING_INDEX(t.`groupOccurrenceKey`, ':', 2), ':', -1)
SET t.`groupOccurrenceKey` = CONCAT(s.pid, ':', s.aid, ':', CAST(SUBSTRING_INDEX(t.`groupOccurrenceKey`, ':', -1) AS UNSIGNED) * s.len + s.rd, ':', s.ord)
WHERE t.`groupOccurrenceKey` IS NOT NULL
  AND CHAR_LENGTH(t.`groupOccurrenceKey`) - CHAR_LENGTH(REPLACE(t.`groupOccurrenceKey`, ':', '')) = 2;

UPDATE `CompletionShare` t
JOIN (
  SELECT si.`id` AS sid, si.`programVersionId` AS vid, v.`programId` AS pid, si.`activityId` AS aid, si.`relativeDay` AS rd,
         COALESCE(v.`durationDays`, v.`cycleDays`, 7) AS len,
         ROW_NUMBER() OVER (PARTITION BY si.`programVersionId`, si.`activityId`, si.`relativeDay` ORDER BY si.`position`, si.`id`) - 1 AS ord
  FROM `ProgramScheduleItem` si
  JOIN `ProgramVersion` v ON v.`id` = si.`programVersionId`
) s
  ON s.vid = SUBSTRING_INDEX(t.`occurrenceKey`, ':', 1)
 AND s.sid = SUBSTRING_INDEX(SUBSTRING_INDEX(t.`occurrenceKey`, ':', 2), ':', -1)
SET t.`occurrenceKey` = CONCAT(s.pid, ':', s.aid, ':', CAST(SUBSTRING_INDEX(t.`occurrenceKey`, ':', -1) AS UNSIGNED) * s.len + s.rd, ':', s.ord)
WHERE t.`occurrenceKey` IS NOT NULL
  AND CHAR_LENGTH(t.`occurrenceKey`) - CHAR_LENGTH(REPLACE(t.`occurrenceKey`, ':', '')) = 2;

UPDATE `MediaPublication` t
JOIN (
  SELECT si.`id` AS sid, si.`programVersionId` AS vid, v.`programId` AS pid, si.`activityId` AS aid, si.`relativeDay` AS rd,
         COALESCE(v.`durationDays`, v.`cycleDays`, 7) AS len,
         ROW_NUMBER() OVER (PARTITION BY si.`programVersionId`, si.`activityId`, si.`relativeDay` ORDER BY si.`position`, si.`id`) - 1 AS ord
  FROM `ProgramScheduleItem` si
  JOIN `ProgramVersion` v ON v.`id` = si.`programVersionId`
) s
  ON s.vid = SUBSTRING_INDEX(t.`occurrenceKey`, ':', 1)
 AND s.sid = SUBSTRING_INDEX(SUBSTRING_INDEX(t.`occurrenceKey`, ':', 2), ':', -1)
SET t.`occurrenceKey` = CONCAT(s.pid, ':', s.aid, ':', CAST(SUBSTRING_INDEX(t.`occurrenceKey`, ':', -1) AS UNSIGNED) * s.len + s.rd, ':', s.ord)
WHERE t.`occurrenceKey` IS NOT NULL
  AND CHAR_LENGTH(t.`occurrenceKey`) - CHAR_LENGTH(REPLACE(t.`occurrenceKey`, ':', '')) = 2;

UPDATE `Notification` t
JOIN (
  SELECT si.`id` AS sid, si.`programVersionId` AS vid, v.`programId` AS pid, si.`activityId` AS aid, si.`relativeDay` AS rd,
         COALESCE(v.`durationDays`, v.`cycleDays`, 7) AS len,
         ROW_NUMBER() OVER (PARTITION BY si.`programVersionId`, si.`activityId`, si.`relativeDay` ORDER BY si.`position`, si.`id`) - 1 AS ord
  FROM `ProgramScheduleItem` si
  JOIN `ProgramVersion` v ON v.`id` = si.`programVersionId`
) s
  ON s.vid = SUBSTRING_INDEX(t.`groupOccurrenceKey`, ':', 1)
 AND s.sid = SUBSTRING_INDEX(SUBSTRING_INDEX(t.`groupOccurrenceKey`, ':', 2), ':', -1)
SET t.`groupOccurrenceKey` = CONCAT(s.pid, ':', s.aid, ':', CAST(SUBSTRING_INDEX(t.`groupOccurrenceKey`, ':', -1) AS UNSIGNED) * s.len + s.rd, ':', s.ord)
WHERE t.`groupOccurrenceKey` IS NOT NULL
  AND CHAR_LENGTH(t.`groupOccurrenceKey`) - CHAR_LENGTH(REPLACE(t.`groupOccurrenceKey`, ':', '')) = 2;
