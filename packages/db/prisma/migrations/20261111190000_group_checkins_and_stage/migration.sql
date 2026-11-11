-- DropForeignKey
ALTER TABLE `CompletionShare` DROP FOREIGN KEY `CompletionShare_calendarItemId_fkey`;

-- DropIndex
DROP INDEX `CompletionShare_calendarItemId_key` ON `CompletionShare`;

-- AlterTable
ALTER TABLE `CompletionShare` ADD COLUMN `mediaPublicationId` CHAR(36) NULL,
    ADD COLUMN `note` VARCHAR(500) NULL,
    MODIFY `calendarItemId` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('ACTIVITY_REMINDER', 'DAILY_SUMMARY', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED', 'GROUP_INVITE', 'MEMBER_JOINED', 'COMPLETION_SHARED', 'COMPLETION_REACTION', 'GROUP_MEDIA_SHARED', 'GROUP_MEDIA_COMMENT', 'CONTRIBUTION_APPROVED', 'PROGRAM_ACCESS', 'PROGRAM_UPDATE', 'ACHIEVEMENT_EARNED', 'PAYMENT_ISSUE', 'COMPLETION_COMMENT') NOT NULL;

-- AlterTable
ALTER TABLE `ProgramGroup` ADD COLUMN `stageTheme` VARCHAR(40) NOT NULL DEFAULT 'constellation';

-- CreateTable
CREATE TABLE `CompletionComment` (
    `id` CHAR(36) NOT NULL,
    `completionShareId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `body` VARCHAR(1000) NOT NULL,
    `status` ENUM('VISIBLE', 'HIDDEN') NOT NULL DEFAULT 'VISIBLE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `CompletionComment_completionShareId_createdAt_id_idx`(`completionShareId`, `createdAt`, `id`),
    INDEX `CompletionComment_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `CompletionShare_groupId_revokedAt_completedAt_idx` ON `CompletionShare`(`groupId`, `revokedAt`, `completedAt`);

-- CreateIndex
CREATE INDEX `CompletionShare_activityId_userId_idx` ON `CompletionShare`(`activityId`, `userId`);

-- CreateIndex
CREATE INDEX `CompletionShare_mediaPublicationId_idx` ON `CompletionShare`(`mediaPublicationId`);

-- CreateIndex
CREATE UNIQUE INDEX `CompletionShare_groupId_calendarItemId_key` ON `CompletionShare`(`groupId`, `calendarItemId`);

-- AddForeignKey
ALTER TABLE `CompletionShare` ADD CONSTRAINT `CompletionShare_calendarItemId_fkey` FOREIGN KEY (`calendarItemId`) REFERENCES `CalendarItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionShare` ADD CONSTRAINT `CompletionShare_mediaPublicationId_fkey` FOREIGN KEY (`mediaPublicationId`) REFERENCES `MediaPublication`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionComment` ADD CONSTRAINT `CompletionComment_completionShareId_fkey` FOREIGN KEY (`completionShareId`) REFERENCES `CompletionShare`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionComment` ADD CONSTRAINT `CompletionComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

