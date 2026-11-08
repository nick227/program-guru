-- AlterTable
ALTER TABLE `MediaAsset` ADD COLUMN `purgedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `MediaAttachmentIntent` (
    `id` CHAR(36) NOT NULL,
    `mediaId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `targetKind` VARCHAR(32) NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `purpose` ENUM('COVER', 'DEMONSTRATION', 'ILLUSTRATION', 'JOURNAL', 'AVATAR', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `position` INTEGER NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'SUPERSEDED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `error` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MediaAttachmentIntent_mediaId_key`(`mediaId`),
    INDEX `MediaAttachmentIntent_targetKind_targetId_status_idx`(`targetKind`, `targetId`, `status`),
    INDEX `MediaAttachmentIntent_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `MediaAsset_deletedAt_purgedAt_idx` ON `MediaAsset`(`deletedAt`, `purgedAt`);

-- AddForeignKey
ALTER TABLE `MediaAttachmentIntent` ADD CONSTRAINT `MediaAttachmentIntent_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAttachmentIntent` ADD CONSTRAINT `MediaAttachmentIntent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

