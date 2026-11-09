ALTER TABLE `CalendarItem` ADD COLUMN `pausedByEnrollment` BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE `ProgramLibraryState` (
 `userId` CHAR(36) NOT NULL, `programId` CHAR(36) NOT NULL, `archivedAt` DATETIME(3) NULL,
 PRIMARY KEY (`userId`, `programId`), INDEX `ProgramLibraryState_programId_idx` (`programId`),
 CONSTRAINT `ProgramLibraryState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT `ProgramLibraryState_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
