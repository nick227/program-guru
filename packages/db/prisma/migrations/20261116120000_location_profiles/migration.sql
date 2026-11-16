ALTER TABLE `UserProfile`
  ADD COLUMN `businessPhone` VARCHAR(40) NULL,
  ADD COLUMN `businessWebsite` VARCHAR(500) NULL;

ALTER TABLE `Place`
  MODIFY `sourceUrl` VARCHAR(500) NULL,
  MODIFY `kind` VARCHAR(40) NOT NULL DEFAULT 'other',
  ADD COLUMN `postalCode` VARCHAR(32) NULL,
  ADD COLUMN `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN `businessProfileUserId` CHAR(36) NULL,
  ADD COLUMN `submittedByUserId` CHAR(36) NULL,
  ADD COLUMN `provenance` VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN `sourceNamespace` VARCHAR(100) NULL,
  ADD COLUMN `externalId` VARCHAR(200) NULL,
  ADD COLUMN `addressFingerprint` CHAR(64) NULL;

CREATE UNIQUE INDEX `Place_sourceNamespace_externalId_key` ON `Place`(`sourceNamespace`, `externalId`);
CREATE INDEX `Place_addressFingerprint_idx` ON `Place`(`addressFingerprint`);
CREATE INDEX `Place_businessProfileUserId_idx` ON `Place`(`businessProfileUserId`);
CREATE INDEX `Place_submittedByUserId_idx` ON `Place`(`submittedByUserId`);
CREATE INDEX `Place_visibility_isActive_name_idx` ON `Place`(`visibility`, `isActive`, `name`);
ALTER TABLE `Place` ADD CONSTRAINT `Place_businessProfileUserId_fkey` FOREIGN KEY (`businessProfileUserId`) REFERENCES `UserProfile`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Place` ADD CONSTRAINT `Place_submittedByUserId_fkey` FOREIGN KEY (`submittedByUserId`) REFERENCES `UserProfile`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;
