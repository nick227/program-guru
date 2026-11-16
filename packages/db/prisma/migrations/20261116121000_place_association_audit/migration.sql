CREATE TABLE `PlaceAssociationAudit` (
  `id` CHAR(36) NOT NULL,
  `actorId` CHAR(36) NOT NULL,
  `placeId` CHAR(36) NOT NULL,
  `previousProfileId` CHAR(36) NULL,
  `nextProfileId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `PlaceAssociationAudit_placeId_createdAt_idx` (`placeId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
