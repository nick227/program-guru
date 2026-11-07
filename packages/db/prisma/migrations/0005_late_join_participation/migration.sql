-- Late joiners (10-COLLABORATION.md §3): items dated before a participant joined are NOT_PARTICIPATING,
-- and adherence excludes dates before the enrollment's participationStartDate. Both changes are additive.
ALTER TABLE `CalendarItem` MODIFY `status` ENUM('PLANNED', 'SKIPPED', 'CANCELLED', 'DONE', 'NOT_PARTICIPATING') NOT NULL DEFAULT 'PLANNED';
ALTER TABLE `ProgramEnrollment` ADD COLUMN `participationStartDate` DATE NULL;
