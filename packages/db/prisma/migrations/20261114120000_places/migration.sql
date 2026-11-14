-- Catalog Expansion: optional platform-curated Places (08-ACTIVITIES §2a, 09-CALENDARS §2). Additive only.

-- CreateTable
CREATE TABLE `Place` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `addressLine` VARCHAR(200) NULL,
    `locality` VARCHAR(100) NOT NULL,
    `region` VARCHAR(100) NOT NULL,
    `countryCode` CHAR(2) NOT NULL,
    `sourceUrl` VARCHAR(500) NOT NULL,
    `accessNote` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Place_slug_key`(`slug`),
    INDEX `Place_isActive_locality_idx`(`isActive`, `locality`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Activity` ADD COLUMN `placeId` CHAR(36) NULL;
ALTER TABLE `CalendarItem` ADD COLUMN `placeId` CHAR(36) NULL;
ALTER TABLE `CalendarRecurrence` ADD COLUMN `placeId` CHAR(36) NULL;

-- CreateIndex
CREATE INDEX `Activity_placeId_idx` ON `Activity`(`placeId`);
CREATE INDEX `CalendarItem_placeId_idx` ON `CalendarItem`(`placeId`);
CREATE INDEX `CalendarRecurrence_placeId_idx` ON `CalendarRecurrence`(`placeId`);

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `Place`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CalendarRecurrence` ADD CONSTRAINT `CalendarRecurrence_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `Place`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `Place`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
