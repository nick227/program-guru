-- Activity duration is stored as whole minutes (08-ACTIVITIES.md §2: durationMinutes, 1–1440, never free text).
-- Replaces the free-text columns from 20261110130000_activity_duration_text, converting values such as
-- "45 min", "1 hr" or "1 hr 30 min" (a range like "20–25 min" keeps its first number); unparseable text becomes NULL.
ALTER TABLE `Activity` ADD COLUMN `durationMinutes` INTEGER NULL;
ALTER TABLE `ActivityRevision` ADD COLUMN `durationMinutesSnapshot` INTEGER NULL;

UPDATE `Activity`
SET `durationMinutes` = NULLIF(LEAST(1440,
      COALESCE(CAST(REGEXP_SUBSTR(`duration`, '[0-9]+(?=\\s*h)', 1, 1, 'i') AS UNSIGNED), 0) * 60
    + COALESCE(CAST(REGEXP_SUBSTR(`duration`, '[0-9]+(?=\\s*(?:[-–][0-9]+\\s*)?m)', 1, 1, 'i') AS UNSIGNED), 0)), 0)
WHERE `duration` IS NOT NULL;

UPDATE `ActivityRevision`
SET `durationMinutesSnapshot` = NULLIF(LEAST(1440,
      COALESCE(CAST(REGEXP_SUBSTR(`durationSnapshot`, '[0-9]+(?=\\s*h)', 1, 1, 'i') AS UNSIGNED), 0) * 60
    + COALESCE(CAST(REGEXP_SUBSTR(`durationSnapshot`, '[0-9]+(?=\\s*(?:[-–][0-9]+\\s*)?m)', 1, 1, 'i') AS UNSIGNED), 0)), 0)
WHERE `durationSnapshot` IS NOT NULL;

ALTER TABLE `Activity` DROP COLUMN `duration`;
ALTER TABLE `ActivityRevision` DROP COLUMN `durationSnapshot`;
