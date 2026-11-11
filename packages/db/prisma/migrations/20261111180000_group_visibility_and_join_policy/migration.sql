-- AlterTable
ALTER TABLE `ProgramGroup` ADD COLUMN `joinPolicy` ENUM('INVITE_ONLY', 'OPEN') NOT NULL DEFAULT 'INVITE_ONLY',
    ADD COLUMN `visibility` ENUM('PRIVATE', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE';

-- CreateIndex
CREATE INDEX `ProgramGroup_visibility_status_startLocalDate_idx` ON `ProgramGroup`(`visibility`, `status`, `startLocalDate`);

