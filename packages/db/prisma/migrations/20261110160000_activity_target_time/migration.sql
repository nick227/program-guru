-- Activity optional target time of day (HH:mm, 24-hour local time).
ALTER TABLE `Activity` ADD COLUMN `targetTime` VARCHAR(5) NULL;
ALTER TABLE `ActivityRevision` ADD COLUMN `targetTimeSnapshot` VARCHAR(5) NULL;

