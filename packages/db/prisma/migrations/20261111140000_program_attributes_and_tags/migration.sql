-- Add cross-category Program attributes (level, sessionMinutes) and flexible Tags (02-DOMAIN.md §2, 07-PROGRAMS.md §2).
CREATE TABLE `Tag` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `group` VARCHAR(40) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Tag_slug_key`(`slug`),
    INDEX `Tag_isActive_position_idx`(`isActive`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProgramTag` (
    `programId` CHAR(36) NOT NULL,
    `tagId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProgramTag_tagId_idx`(`tagId`),
    PRIMARY KEY (`programId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Program`
    ADD COLUMN `level` ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS') NOT NULL DEFAULT 'ALL_LEVELS',
    ADD COLUMN `sessionMinutes` INTEGER NULL;

ALTER TABLE `ProgramVersion`
    ADD COLUMN `level` ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS') NOT NULL DEFAULT 'ALL_LEVELS',
    ADD COLUMN `sessionMinutes` INTEGER NULL;

CREATE INDEX `Program_level_status_visibility_idx` ON `Program`(`level`, `status`, `visibility`);
CREATE INDEX `Program_sessionMinutes_idx` ON `Program`(`sessionMinutes`);

ALTER TABLE `ProgramTag`
    ADD CONSTRAINT `ProgramTag_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `ProgramTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

