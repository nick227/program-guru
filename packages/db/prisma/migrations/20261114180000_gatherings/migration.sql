-- Standalone Activity gatherings (10-COLLABORATION §9). Additive: every existing group stays kind PROGRAM.

-- ProgramGroup: kind, optional Program version, Activity, time, Place, capacity
ALTER TABLE `ProgramGroup` ADD COLUMN `kind` ENUM('PROGRAM', 'GATHERING') NOT NULL DEFAULT 'PROGRAM',
    ADD COLUMN `activityId` CHAR(36) NULL,
    ADD COLUMN `startLocalTime` VARCHAR(5) NULL,
    ADD COLUMN `placeId` CHAR(36) NULL,
    ADD COLUMN `capacity` INTEGER NULL,
    MODIFY `programVersionId` CHAR(36) NULL;

-- Columns in a CHECK cannot carry cascading FK actions on MySQL: Program version and Activity are RESTRICT both ways.
ALTER TABLE `ProgramGroup` DROP FOREIGN KEY `ProgramGroup_programVersionId_fkey`;
ALTER TABLE `ProgramGroup` ADD CONSTRAINT `ProgramGroup_programVersionId_fkey` FOREIGN KEY (`programVersionId`) REFERENCES `ProgramVersion`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `ProgramGroup` ADD CONSTRAINT `ProgramGroup_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `ProgramGroup` ADD CONSTRAINT `ProgramGroup_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `Place`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- A Program group follows a version; a gathering is one dated occurrence of one Activity.
ALTER TABLE `ProgramGroup` ADD CONSTRAINT `ProgramGroup_kind_check` CHECK (
  (`kind` = 'PROGRAM' AND `programVersionId` IS NOT NULL AND `activityId` IS NULL)
  OR (`kind` = 'GATHERING' AND `programVersionId` IS NULL AND `activityId` IS NOT NULL AND `startLocalDate` IS NOT NULL)
);

CREATE INDEX `ProgramGroup_activityId_kind_status_startLocalDate_idx` ON `ProgramGroup`(`activityId`, `kind`, `status`, `startLocalDate`);
CREATE INDEX `ProgramGroup_placeId_idx` ON `ProgramGroup`(`placeId`);

-- CalendarItem: a member's occurrence of a gathering
ALTER TABLE `CalendarItem` ADD COLUMN `gatheringId` CHAR(36) NULL;
CREATE INDEX `CalendarItem_gatheringId_idx` ON `CalendarItem`(`gatheringId`);
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_gatheringId_fkey` FOREIGN KEY (`gatheringId`) REFERENCES `ProgramGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
