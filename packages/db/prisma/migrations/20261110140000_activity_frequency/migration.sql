-- Per-activity frequency on Activity, ActivityRevision, and ProgramScheduleItem.
ALTER TABLE `Activity` ADD COLUMN `frequency` JSON NULL;
ALTER TABLE `ActivityRevision` ADD COLUMN `frequencySnapshot` JSON NULL;
ALTER TABLE `ProgramScheduleItem` ADD COLUMN `frequency` JSON NULL;

