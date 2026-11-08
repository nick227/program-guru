-- AlterTable
ALTER TABLE `Program` ADD COLUMN `slug` VARCHAR(120) NULL;

-- CreateTable
CREATE TABLE `ProgramSlugAlias` (
    `id` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `creatorId` CHAR(36) NULL,
    `slug` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProgramSlugAlias_programId_idx`(`programId`),
    INDEX `ProgramSlugAlias_slug_idx`(`slug`),
    UNIQUE INDEX `ProgramSlugAlias_creatorId_slug_key`(`creatorId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivitySlugAlias` (
    `id` CHAR(36) NOT NULL,
    `activityId` CHAR(36) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ActivitySlugAlias_slug_key`(`slug`),
    INDEX `ActivitySlugAlias_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Program_slug_idx` ON `Program`(`slug`);

-- CreateIndex
CREATE UNIQUE INDEX `Program_creatorId_slug_key` ON `Program`(`creatorId`, `slug`);

-- AddForeignKey
ALTER TABLE `ProgramSlugAlias` ADD CONSTRAINT `ProgramSlugAlias_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramSlugAlias` ADD CONSTRAINT `ProgramSlugAlias_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivitySlugAlias` ADD CONSTRAINT `ActivitySlugAlias_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

