-- Gathering discovery associations and "Looking for" (10-COLLABORATION §9.12). Additive only.

-- Reports can target a gathering's note (appended enum value: no table rebuild).
ALTER TABLE `ContentReport` MODIFY `targetType` ENUM('PROGRAM', 'ACTIVITY', 'MEDIA', 'COMMENT', 'USER', 'GATHERING') NOT NULL;
ALTER TABLE `ModerationAction` MODIFY `targetType` ENUM('PROGRAM', 'ACTIVITY', 'MEDIA', 'COMMENT', 'USER', 'GATHERING') NOT NULL;

-- Optional organizer note, hidden by moderation while lookingForHiddenAt is set.
ALTER TABLE `ProgramGroup` ADD COLUMN `lookingFor` VARCHAR(140) NULL,
    ADD COLUMN `lookingForHiddenAt` DATETIME(3) NULL;

-- Additional curated Categories of a gathering; never changes the Activity's own classification.
CREATE TABLE `GatheringFocus` (
    `groupId` CHAR(36) NOT NULL,
    `focusId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `GatheringFocus_focusId_idx`(`focusId`),
    PRIMARY KEY (`groupId`, `focusId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GatheringFocus` ADD CONSTRAINT `GatheringFocus_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProgramGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GatheringFocus` ADD CONSTRAINT `GatheringFocus_focusId_fkey` FOREIGN KEY (`focusId`) REFERENCES `Focus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
