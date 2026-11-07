-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `role` ENUM('USER', 'MODERATOR', 'ADMIN') NOT NULL DEFAULT 'USER',
    `status` ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    `deactivatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserProfile` (
    `userId` CHAR(36) NOT NULL,
    `handle` VARCHAR(40) NOT NULL,
    `displayName` VARCHAR(80) NOT NULL,
    `bio` VARCHAR(500) NULL,
    `avatarMediaId` CHAR(36) NULL,
    `coverMediaId` CHAR(36) NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserProfile_handle_key`(`handle`),
    INDEX `UserProfile_avatarMediaId_idx`(`avatarMediaId`),
    INDEX `UserProfile_coverMediaId_idx`(`coverMediaId`),
    INDEX `UserProfile_displayName_idx`(`displayName`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserPreference` (
    `userId` CHAR(36) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
    `locale` VARCHAR(20) NOT NULL DEFAULT 'en-US',
    `defaultVisibility` ENUM('PRIVATE', 'UNLISTED', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `inAppRemindersEnabled` BOOLEAN NOT NULL DEFAULT true,
    `dailyEmailEnabled` BOOLEAN NOT NULL DEFAULT false,
    `dailyReminderTime` VARCHAR(5) NOT NULL DEFAULT '08:00',
    `notifyGroupActivity` BOOLEAN NOT NULL DEFAULT true,
    `notifyFollowRequests` BOOLEAN NOT NULL DEFAULT true,
    `mutedGroupIds` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserPreference_dailyEmailEnabled_idx`(`dailyEmailEnabled`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthIdentity` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `provider` ENUM('GOOGLE') NOT NULL,
    `providerSubject` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuthIdentity_userId_idx`(`userId`),
    UNIQUE INDEX `AuthIdentity_provider_providerSubject_key`(`provider`, `providerSubject`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LocalCredential` (
    `userId` CHAR(36) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthToken` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `purpose` ENUM('VERIFY_EMAIL', 'RESET_PASSWORD') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AuthToken_tokenHash_key`(`tokenHash`),
    INDEX `AuthToken_userId_purpose_idx`(`userId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserFollow` (
    `followerId` CHAR(36) NOT NULL,
    `followedId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserFollow_followedId_createdAt_idx`(`followedId`, `createdAt`),
    PRIMARY KEY (`followerId`, `followedId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FollowRequest` (
    `id` CHAR(36) NOT NULL,
    `requesterId` CHAR(36) NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FollowRequest_targetId_status_createdAt_idx`(`targetId`, `status`, `createdAt`),
    UNIQUE INDEX `FollowRequest_requesterId_targetId_key`(`requesterId`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserBlock` (
    `blockerId` CHAR(36) NOT NULL,
    `blockedId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserBlock_blockedId_idx`(`blockedId`),
    PRIMARY KEY (`blockerId`, `blockedId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `icon` VARCHAR(64) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `reviewState` ENUM('APPROVED', 'PENDING', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Category_slug_key`(`slug`),
    INDEX `Category_isActive_position_idx`(`isActive`, `position`),
    INDEX `Category_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramType` (
    `id` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `icon` VARCHAR(64) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `reviewState` ENUM('APPROVED', 'PENDING', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProgramType_isFeatured_position_idx`(`isFeatured`, `position`),
    INDEX `ProgramType_createdById_idx`(`createdById`),
    UNIQUE INDEX `ProgramType_categoryId_slug_key`(`categoryId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Focus` (
    `id` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `reviewState` ENUM('APPROVED', 'PENDING', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Focus_createdById_idx`(`createdById`),
    UNIQUE INDEX `Focus_categoryId_slug_key`(`categoryId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramTypeFocus` (
    `programTypeId` CHAR(36) NOT NULL,
    `focusId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProgramTypeFocus_focusId_idx`(`focusId`),
    PRIMARY KEY (`programTypeId`, `focusId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityFocus` (
    `activityId` CHAR(36) NOT NULL,
    `focusId` CHAR(36) NOT NULL,

    INDEX `ActivityFocus_focusId_idx`(`focusId`),
    PRIMARY KEY (`activityId`, `focusId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MetricDefinition` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `valueType` ENUM('INTEGER', 'DECIMAL', 'BOOLEAN', 'TEXT', 'DURATION') NOT NULL,
    `unit` VARCHAR(40) NULL,
    `precision` INTEGER NULL,
    `aggregation` ENUM('SUM', 'MAX', 'MIN', 'AVERAGE', 'LAST', 'COUNT', 'NONE') NOT NULL DEFAULT 'NONE',
    `betterDirection` ENUM('HIGHER', 'LOWER', 'TARGET', 'NONE') NOT NULL DEFAULT 'NONE',
    `validation` JSON NULL,
    `ownerId` CHAR(36) NULL,

    UNIQUE INDEX `MetricDefinition_key_key`(`key`),
    INDEX `MetricDefinition_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ToolDefinition` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `componentKey` VARCHAR(64) NOT NULL,
    `defaultConfig` JSON NULL,
    `supportedValueTypes` JSON NULL,

    UNIQUE INDEX `ToolDefinition_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Activity` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(120) NULL,
    `creatorId` CHAR(36) NULL,
    `categoryId` CHAR(36) NOT NULL,
    `title` VARCHAR(140) NOT NULL,
    `summary` VARCHAR(500) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `visibility` ENUM('PRIVATE', 'UNLISTED', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `sourceActivityId` CHAR(36) NULL,
    `canonicalActivityId` CHAR(36) NULL,
    `latestPublishedRevisionId` CHAR(36) NULL,
    `draftRevision` INTEGER NOT NULL DEFAULT 0,
    `moderatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Activity_slug_key`(`slug`),
    UNIQUE INDEX `Activity_latestPublishedRevisionId_key`(`latestPublishedRevisionId`),
    INDEX `Activity_categoryId_status_visibility_idx`(`categoryId`, `status`, `visibility`),
    INDEX `Activity_creatorId_status_idx`(`creatorId`, `status`),
    INDEX `Activity_canonicalActivityId_idx`(`canonicalActivityId`),
    INDEX `Activity_sourceActivityId_idx`(`sourceActivityId`),
    FULLTEXT INDEX `Activity_title_summary_ft`(`title`, `summary`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityRevision` (
    `id` CHAR(36) NOT NULL,
    `activityId` CHAR(36) NOT NULL,
    `revisionNumber` INTEGER NOT NULL,
    `titleSnapshot` VARCHAR(140) NOT NULL,
    `summarySnapshot` VARCHAR(500) NULL,
    `publishedAt` DATETIME(3) NULL,
    `editorId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityRevision_editorId_idx`(`editorId`),
    UNIQUE INDEX `ActivityRevision_activityId_revisionNumber_key`(`activityId`, `revisionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Instruction` (
    `id` CHAR(36) NOT NULL,
    `instructionKey` CHAR(36) NOT NULL,
    `activityRevisionId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `title` VARCHAR(120) NULL,
    `body` TEXT NULL,
    `mediaLayoutHint` VARCHAR(40) NULL,

    INDEX `Instruction_instructionKey_idx`(`instructionKey`),
    UNIQUE INDEX `Instruction_activityRevisionId_position_key`(`activityRevisionId`, `position`),
    UNIQUE INDEX `Instruction_activityRevisionId_instructionKey_key`(`activityRevisionId`, `instructionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityMetric` (
    `id` CHAR(36) NOT NULL,
    `activityRevisionId` CHAR(36) NULL,
    `instructionId` CHAR(36) NULL,
    `metricDefinitionId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `defaults` JSON NULL,
    `rollupToMetricKey` VARCHAR(80) NULL,

    INDEX `ActivityMetric_activityRevisionId_position_idx`(`activityRevisionId`, `position`),
    INDEX `ActivityMetric_instructionId_position_idx`(`instructionId`, `position`),
    INDEX `ActivityMetric_metricDefinitionId_idx`(`metricDefinitionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityTool` (
    `id` CHAR(36) NOT NULL,
    `activityRevisionId` CHAR(36) NULL,
    `instructionId` CHAR(36) NULL,
    `toolDefinitionId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,

    INDEX `ActivityTool_activityRevisionId_position_idx`(`activityRevisionId`, `position`),
    INDEX `ActivityTool_instructionId_position_idx`(`instructionId`, `position`),
    INDEX `ActivityTool_toolDefinitionId_idx`(`toolDefinitionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Program` (
    `id` CHAR(36) NOT NULL,
    `creatorId` CHAR(36) NULL,
    `title` VARCHAR(140) NOT NULL,
    `description` TEXT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `programTypeId` CHAR(36) NOT NULL,
    `focusId` CHAR(36) NULL,
    `coverMediaId` CHAR(36) NULL,
    `visibility` ENUM('PRIVATE', 'UNLISTED', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `latestPublishedVersionId` CHAR(36) NULL,
    `draftRevision` INTEGER NOT NULL DEFAULT 0,
    `moderatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Program_latestPublishedVersionId_key`(`latestPublishedVersionId`),
    INDEX `Program_creatorId_status_idx`(`creatorId`, `status`),
    INDEX `Program_categoryId_programTypeId_status_visibility_idx`(`categoryId`, `programTypeId`, `status`, `visibility`),
    INDEX `Program_focusId_idx`(`focusId`),
    INDEX `Program_programTypeId_idx`(`programTypeId`),
    INDEX `Program_coverMediaId_idx`(`coverMediaId`),
    FULLTEXT INDEX `Program_title_ft`(`title`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramVersion` (
    `id` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `title` VARCHAR(140) NOT NULL,
    `description` TEXT NULL,
    `programTypeId` CHAR(36) NOT NULL,
    `focusId` CHAR(36) NULL,
    `durationDays` INTEGER NULL,
    `cycleDays` INTEGER NULL,
    `frequency` JSON NOT NULL,
    `generationMode` ENUM('ALL_EACH_DAY', 'ROTATE') NOT NULL DEFAULT 'ALL_EACH_DAY',
    `programDayCount` INTEGER NOT NULL DEFAULT 0,
    `placementCount` INTEGER NOT NULL DEFAULT 0,
    `publishedAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProgramVersion_programId_publishedAt_idx`(`programId`, `publishedAt`),
    INDEX `ProgramVersion_programTypeId_idx`(`programTypeId`),
    INDEX `ProgramVersion_focusId_idx`(`focusId`),
    INDEX `ProgramVersion_createdById_idx`(`createdById`),
    UNIQUE INDEX `ProgramVersion_programId_versionNumber_key`(`programId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramScheduleItem` (
    `id` CHAR(36) NOT NULL,
    `programVersionId` CHAR(36) NOT NULL,
    `activityId` CHAR(36) NOT NULL,
    `activityRevisionId` CHAR(36) NOT NULL,
    `relativeDay` INTEGER NOT NULL,
    `localTime` VARCHAR(5) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `targetOverrides` JSON NULL,
    `isManual` BOOLEAN NOT NULL DEFAULT false,

    INDEX `ProgramScheduleItem_programVersionId_relativeDay_position_idx`(`programVersionId`, `relativeDay`, `position`),
    INDEX `ProgramScheduleItem_activityId_idx`(`activityId`),
    INDEX `ProgramScheduleItem_activityRevisionId_idx`(`activityRevisionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramAccessPolicy` (
    `programId` CHAR(36) NOT NULL,
    `accessMode` ENUM('OPEN', 'APPROVAL', 'PAID') NOT NULL DEFAULT 'OPEN',
    `previewPolicy` JSON NULL,

    PRIMARY KEY (`programId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramPrice` (
    `id` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `kind` ENUM('ONE_TIME', 'MONTHLY') NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `amountMinor` INTEGER NOT NULL,
    `providerPriceId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `activeKey` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProgramPrice_providerPriceId_key`(`providerPriceId`),
    INDEX `ProgramPrice_programId_active_idx`(`programId`, `active`),
    UNIQUE INDEX `ProgramPrice_programId_activeKey_key`(`programId`, `activeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramEnrollment` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `programVersionId` CHAR(36) NOT NULL,
    `pendingVersionId` CHAR(36) NULL,
    `groupId` CHAR(36) NULL,
    `startLocalDate` DATE NOT NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `status` ENUM('PENDING_ACCESS', 'ACTIVE', 'PAUSED', 'COMPLETED', 'LEFT') NOT NULL DEFAULT 'ACTIVE',
    `activeKey` VARCHAR(80) NULL,
    `generatedThroughDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProgramEnrollment_activeKey_key`(`activeKey`),
    INDEX `ProgramEnrollment_userId_status_idx`(`userId`, `status`),
    INDEX `ProgramEnrollment_programId_status_idx`(`programId`, `status`),
    INDEX `ProgramEnrollment_programVersionId_idx`(`programVersionId`),
    INDEX `ProgramEnrollment_pendingVersionId_idx`(`pendingVersionId`),
    INDEX `ProgramEnrollment_groupId_idx`(`groupId`),
    INDEX `ProgramEnrollment_status_generatedThroughDate_idx`(`status`, `generatedThroughDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramAccessGrant` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `source` ENUM('OPEN', 'APPROVAL', 'PURCHASE', 'SUBSCRIPTION', 'ADMIN') NOT NULL,
    `sourceRef` VARCHAR(191) NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    INDEX `ProgramAccessGrant_userId_programId_revokedAt_idx`(`userId`, `programId`, `revokedAt`),
    INDEX `ProgramAccessGrant_programId_idx`(`programId`),
    UNIQUE INDEX `ProgramAccessGrant_source_sourceRef_key`(`source`, `sourceRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramApprovalRequest` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `activeKey` VARCHAR(80) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ProgramApprovalRequest_activeKey_key`(`activeKey`),
    INDEX `ProgramApprovalRequest_programId_status_requestedAt_idx`(`programId`, `status`, `requestedAt`),
    INDEX `ProgramApprovalRequest_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramSource` (
    `programId` CHAR(36) NOT NULL,
    `sourceProgramVersionId` CHAR(36) NOT NULL,
    `copiedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProgramSource_sourceProgramVersionId_idx`(`sourceProgramVersionId`),
    INDEX `ProgramSource_copiedById_idx`(`copiedById`),
    PRIMARY KEY (`programId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramStat` (
    `programId` CHAR(36) NOT NULL,
    `enrollmentCount` INTEGER NOT NULL DEFAULT 0,
    `completionRate` DECIMAL(5, 4) NULL,
    `retention30d` DECIMAL(5, 4) NULL,
    `rankScore` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProgramStat_rankScore_idx`(`rankScore`),
    PRIMARY KEY (`programId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreatorPayoutAccount` (
    `userId` CHAR(36) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `status` ENUM('ONBOARDING', 'ACTIVE', 'RESTRICTED') NOT NULL DEFAULT 'ONBOARDING',
    `chargesEnabled` BOOLEAN NOT NULL DEFAULT false,
    `payoutsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CreatorPayoutAccount_providerAccountId_key`(`providerAccountId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramPurchase` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `priceId` CHAR(36) NOT NULL,
    `amountMinor` INTEGER NOT NULL,
    `platformFeeMinor` INTEGER NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `status` ENUM('PENDING', 'PAID', 'REFUNDED', 'DISPUTED') NOT NULL DEFAULT 'PENDING',
    `providerCheckoutId` VARCHAR(191) NULL,
    `providerPaymentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProgramPurchase_providerCheckoutId_key`(`providerCheckoutId`),
    UNIQUE INDEX `ProgramPurchase_providerPaymentId_key`(`providerPaymentId`),
    INDEX `ProgramPurchase_userId_programId_status_idx`(`userId`, `programId`, `status`),
    INDEX `ProgramPurchase_programId_status_idx`(`programId`, `status`),
    INDEX `ProgramPurchase_priceId_idx`(`priceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BillingSubscription` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `programId` CHAR(36) NOT NULL,
    `priceId` CHAR(36) NOT NULL,
    `status` ENUM('INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'INCOMPLETE',
    `providerCheckoutId` VARCHAR(191) NULL,
    `providerSubscriptionId` VARCHAR(191) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BillingSubscription_providerCheckoutId_key`(`providerCheckoutId`),
    UNIQUE INDEX `BillingSubscription_providerSubscriptionId_key`(`providerSubscriptionId`),
    INDEX `BillingSubscription_userId_status_idx`(`userId`, `status`),
    INDEX `BillingSubscription_programId_status_idx`(`programId`, `status`),
    INDEX `BillingSubscription_priceId_idx`(`priceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BillingEvent` (
    `id` CHAR(36) NOT NULL,
    `providerEventId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(120) NOT NULL,
    `payload` JSON NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BillingEvent_providerEventId_key`(`providerEventId`),
    INDEX `BillingEvent_processedAt_createdAt_idx`(`processedAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarRecurrence` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `activityId` CHAR(36) NOT NULL,
    `activityRevisionId` CHAR(36) NOT NULL,
    `rule` JSON NOT NULL,
    `anchorDate` DATE NOT NULL,
    `localTime` VARCHAR(5) NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `untilDate` DATE NULL,
    `generatedThroughDate` DATE NULL,
    `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CalendarRecurrence_ownerId_status_idx`(`ownerId`, `status`),
    INDEX `CalendarRecurrence_status_generatedThroughDate_idx`(`status`, `generatedThroughDate`),
    INDEX `CalendarRecurrence_activityId_idx`(`activityId`),
    INDEX `CalendarRecurrence_activityRevisionId_idx`(`activityRevisionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarItem` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `activityId` CHAR(36) NOT NULL,
    `activityRevisionId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NULL,
    `sourceScheduleItemId` CHAR(36) NULL,
    `recurrenceId` CHAR(36) NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `groupOccurrenceKey` VARCHAR(140) NULL,
    `programDayIndex` INTEGER NULL,
    `localDate` DATE NOT NULL,
    `localTime` VARCHAR(5) NULL,
    `scheduledAtUtc` DATETIME(3) NULL,
    `status` ENUM('PLANNED', 'SKIPPED', 'CANCELLED', 'DONE') NOT NULL DEFAULT 'PLANNED',
    `targetOverrides` JSON NULL,
    `movedFromDate` DATE NULL,
    `isUserAdjusted` BOOLEAN NOT NULL DEFAULT false,
    `reminderSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CalendarItem_idempotencyKey_key`(`idempotencyKey`),
    INDEX `CalendarItem_ownerId_localDate_status_idx`(`ownerId`, `localDate`, `status`),
    INDEX `CalendarItem_ownerId_activityId_status_idx`(`ownerId`, `activityId`, `status`),
    INDEX `CalendarItem_enrollmentId_sourceScheduleItemId_idx`(`enrollmentId`, `sourceScheduleItemId`),
    INDEX `CalendarItem_recurrenceId_localDate_idx`(`recurrenceId`, `localDate`),
    INDEX `CalendarItem_groupOccurrenceKey_idx`(`groupOccurrenceKey`),
    INDEX `CalendarItem_status_scheduledAtUtc_reminderSentAt_idx`(`status`, `scheduledAtUtc`, `reminderSentAt`),
    INDEX `CalendarItem_activityId_idx`(`activityId`),
    INDEX `CalendarItem_activityRevisionId_idx`(`activityRevisionId`),
    INDEX `CalendarItem_sourceScheduleItemId_idx`(`sourceScheduleItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivitySession` (
    `id` CHAR(36) NOT NULL,
    `calendarItemId` CHAR(36) NULL,
    `activityRevisionId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `status` ENUM('READY', 'ACTIVE', 'PAUSED', 'FINISHED', 'ABANDONED') NOT NULL DEFAULT 'READY',
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `activeSeconds` INTEGER NOT NULL DEFAULT 0,
    `lastResumedAt` DATETIME(3) NULL,
    `isManualCompletion` BOOLEAN NOT NULL DEFAULT false,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivitySession_userId_status_idx`(`userId`, `status`),
    INDEX `ActivitySession_calendarItemId_idx`(`calendarItemId`),
    INDEX `ActivitySession_activityRevisionId_idx`(`activityRevisionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResultEntry` (
    `id` CHAR(36) NOT NULL,
    `sessionId` CHAR(36) NOT NULL,
    `instructionId` CHAR(36) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ResultEntry_sessionId_idx`(`sessionId`),
    INDEX `ResultEntry_instructionId_idx`(`instructionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResultMetricValue` (
    `id` CHAR(36) NOT NULL,
    `entryId` CHAR(36) NOT NULL,
    `metricDefinitionId` CHAR(36) NOT NULL,
    `intValue` INTEGER NULL,
    `decimalValue` DECIMAL(18, 4) NULL,
    `boolValue` BOOLEAN NULL,
    `textValue` TEXT NULL,
    `durationSeconds` INTEGER NULL,
    `unit` VARCHAR(20) NULL,

    INDEX `ResultMetricValue_entryId_idx`(`entryId`),
    INDEX `ResultMetricValue_metricDefinitionId_idx`(`metricDefinitionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AchievementDefinition` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `description` VARCHAR(200) NOT NULL,
    `icon` VARCHAR(64) NOT NULL,
    `ruleKind` ENUM('TOTAL_COMPLETIONS', 'PROGRAM_FIRST_WEEK', 'PROGRAM_HALFWAY', 'PROGRAM_COMPLETED') NOT NULL,
    `threshold` INTEGER NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `AchievementDefinition_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAchievement` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `definitionId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NULL,
    `sourceCalendarItemId` CHAR(36) NULL,
    `scopeKey` VARCHAR(80) NOT NULL,
    `isShared` BOOLEAN NOT NULL DEFAULT false,
    `earnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    INDEX `UserAchievement_userId_isShared_revokedAt_idx`(`userId`, `isShared`, `revokedAt`),
    INDEX `UserAchievement_definitionId_idx`(`definitionId`),
    INDEX `UserAchievement_enrollmentId_idx`(`enrollmentId`),
    INDEX `UserAchievement_sourceCalendarItemId_idx`(`sourceCalendarItemId`),
    UNIQUE INDEX `UserAchievement_userId_scopeKey_key`(`userId`, `scopeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramGroup` (
    `id` CHAR(36) NOT NULL,
    `programVersionId` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NULL,
    `mode` ENUM('SYNC', 'ASYNC') NOT NULL DEFAULT 'SYNC',
    `joinLinkEnabled` BOOLEAN NOT NULL DEFAULT false,
    `startLocalDate` DATE NULL,
    `timezone` VARCHAR(64) NULL,
    `status` ENUM('ACTIVE', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProgramGroup_programVersionId_status_idx`(`programVersionId`, `status`),
    INDEX `ProgramGroup_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GroupMember` (
    `groupId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `role` ENUM('OWNER', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `status` ENUM('ACTIVE', 'LEFT', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `sharedCompletionEnabled` BOOLEAN NOT NULL DEFAULT true,
    `joinedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GroupMember_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`groupId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GroupInvitation` (
    `id` CHAR(36) NOT NULL,
    `groupId` CHAR(36) NOT NULL,
    `kind` ENUM('USER', 'EMAIL', 'LINK') NOT NULL,
    `createdById` CHAR(36) NOT NULL,
    `invitedUserId` CHAR(36) NULL,
    `invitedEmailHash` CHAR(64) NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GroupInvitation_tokenHash_key`(`tokenHash`),
    INDEX `GroupInvitation_groupId_status_idx`(`groupId`, `status`),
    INDEX `GroupInvitation_createdById_idx`(`createdById`),
    INDEX `GroupInvitation_invitedUserId_status_idx`(`invitedUserId`, `status`),
    INDEX `GroupInvitation_invitedEmailHash_idx`(`invitedEmailHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompletionShare` (
    `id` CHAR(36) NOT NULL,
    `groupId` CHAR(36) NOT NULL,
    `occurrenceKey` VARCHAR(140) NOT NULL,
    `calendarItemId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `activityId` CHAR(36) NOT NULL,
    `programDayIndex` INTEGER NULL,
    `completedAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `CompletionShare_calendarItemId_key`(`calendarItemId`),
    INDEX `CompletionShare_groupId_occurrenceKey_idx`(`groupId`, `occurrenceKey`),
    INDEX `CompletionShare_groupId_completedAt_idx`(`groupId`, `completedAt`),
    INDEX `CompletionShare_userId_idx`(`userId`),
    INDEX `CompletionShare_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompletionReaction` (
    `completionShareId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `emoji` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CompletionReaction_userId_idx`(`userId`),
    PRIMARY KEY (`completionShareId`, `userId`, `emoji`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NULL,
    `type` ENUM('PHOTO', 'VIDEO', 'AUDIO') NOT NULL,
    `originalStorageKey` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(100) NOT NULL,
    `byteSize` BIGINT NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationMs` INTEGER NULL,
    `checksum` VARCHAR(128) NULL,
    `alt` VARCHAR(300) NULL,
    `state` ENUM('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'BLOCKED') NOT NULL DEFAULT 'UPLOADING',
    `license` VARCHAR(120) NULL,
    `attribution` VARCHAR(300) NULL,
    `sourceUrl` VARCHAR(500) NULL,
    `uploadExpiresAt` DATETIME(3) NULL,
    `uploadedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `MediaAsset_originalStorageKey_key`(`originalStorageKey`),
    INDEX `MediaAsset_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    INDEX `MediaAsset_state_uploadExpiresAt_idx`(`state`, `uploadExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaVariant` (
    `id` CHAR(36) NOT NULL,
    `mediaId` CHAR(36) NOT NULL,
    `kind` ENUM('THUMB', 'POSTER', 'STREAM', 'ORIGINAL', 'WEB') NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(100) NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationMs` INTEGER NULL,
    `byteSize` BIGINT NOT NULL,

    UNIQUE INDEX `MediaVariant_storageKey_key`(`storageKey`),
    UNIQUE INDEX `MediaVariant_mediaId_kind_key`(`mediaId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAttachment` (
    `id` CHAR(36) NOT NULL,
    `mediaId` CHAR(36) NOT NULL,
    `programId` CHAR(36) NULL,
    `activityRevisionId` CHAR(36) NULL,
    `instructionId` CHAR(36) NULL,
    `resultEntryId` CHAR(36) NULL,
    `userProfileId` CHAR(36) NULL,
    `purpose` ENUM('COVER', 'DEMONSTRATION', 'ILLUSTRATION', 'JOURNAL', 'AVATAR', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MediaAttachment_mediaId_idx`(`mediaId`),
    INDEX `MediaAttachment_programId_position_idx`(`programId`, `position`),
    INDEX `MediaAttachment_activityRevisionId_position_idx`(`activityRevisionId`, `position`),
    INDEX `MediaAttachment_instructionId_position_idx`(`instructionId`, `position`),
    INDEX `MediaAttachment_resultEntryId_position_idx`(`resultEntryId`, `position`),
    INDEX `MediaAttachment_userProfileId_position_idx`(`userProfileId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaPublication` (
    `id` CHAR(36) NOT NULL,
    `mediaId` CHAR(36) NOT NULL,
    `publishedById` CHAR(36) NOT NULL,
    `audience` ENUM('PUBLIC', 'GROUP') NOT NULL,
    `groupId` CHAR(36) NULL,
    `occurrenceKey` VARCHAR(140) NULL,
    `activityId` CHAR(36) NULL,
    `instructionKey` CHAR(36) NULL,
    `programId` CHAR(36) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `publishedAt` DATETIME(3) NULL,
    `license` VARCHAR(120) NULL,
    `caption` VARCHAR(500) NULL,
    `likeCount` INTEGER NOT NULL DEFAULT 0,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `commentCount` INTEGER NOT NULL DEFAULT 0,
    `rankScore` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `qualityReviewedAt` DATETIME(3) NULL,
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MediaPublication_activityId_audience_status_rankScore_idx`(`activityId`, `audience`, `status`, `rankScore`),
    INDEX `MediaPublication_groupId_occurrenceKey_status_idx`(`groupId`, `occurrenceKey`, `status`),
    INDEX `MediaPublication_publishedById_audience_status_idx`(`publishedById`, `audience`, `status`),
    INDEX `MediaPublication_status_audience_createdAt_idx`(`status`, `audience`, `createdAt`),
    INDEX `MediaPublication_mediaId_idx`(`mediaId`),
    INDEX `MediaPublication_programId_idx`(`programId`),
    INDEX `MediaPublication_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaReaction` (
    `publicationId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` ENUM('LIKE') NOT NULL DEFAULT 'LIKE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MediaReaction_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`publicationId`, `userId`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaComment` (
    `id` CHAR(36) NOT NULL,
    `publicationId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `body` VARCHAR(2000) NOT NULL,
    `status` ENUM('VISIBLE', 'HIDDEN') NOT NULL DEFAULT 'VISIBLE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `MediaComment_publicationId_createdAt_id_idx`(`publicationId`, `createdAt`, `id`),
    INDEX `MediaComment_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicationView` (
    `id` CHAR(36) NOT NULL,
    `publicationId` CHAR(36) NOT NULL,
    `viewerHash` CHAR(64) NOT NULL,
    `qualifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PublicationView_publicationId_viewerHash_key`(`publicationId`, `viewerHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` CHAR(36) NOT NULL,
    `recipientId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `type` ENUM('ACTIVITY_REMINDER', 'DAILY_SUMMARY', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED', 'GROUP_INVITE', 'MEMBER_JOINED', 'COMPLETION_SHARED', 'COMPLETION_REACTION', 'GROUP_MEDIA_SHARED', 'GROUP_MEDIA_COMMENT', 'CONTRIBUTION_APPROVED', 'PROGRAM_ACCESS', 'PROGRAM_UPDATE', 'ACHIEVEMENT_EARNED', 'PAYMENT_ISSUE') NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `deepLink` VARCHAR(300) NOT NULL,
    `entityKind` VARCHAR(40) NOT NULL,
    `entityId` CHAR(36) NOT NULL,
    `groupOccurrenceKey` VARCHAR(140) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`),
    INDEX `Notification_recipientId_readAt_createdAt_idx`(`recipientId`, `readAt`, `createdAt`),
    INDEX `Notification_recipientId_createdAt_id_idx`(`recipientId`, `createdAt`, `id`),
    INDEX `Notification_recipientId_groupOccurrenceKey_readAt_idx`(`recipientId`, `groupOccurrenceKey`, `readAt`),
    INDEX `Notification_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReminderDispatch` (
    `userId` CHAR(36) NOT NULL,
    `localDate` DATE NOT NULL,
    `channel` ENUM('IN_APP', 'EMAIL') NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `localDate`, `channel`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentReport` (
    `id` CHAR(36) NOT NULL,
    `reporterId` CHAR(36) NOT NULL,
    `targetType` ENUM('PROGRAM', 'ACTIVITY', 'MEDIA', 'COMMENT', 'USER') NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `reason` ENUM('HARASSMENT', 'PRIVACY', 'COPYRIGHT', 'MISLEADING', 'UNSAFE', 'OTHER') NOT NULL,
    `details` VARCHAR(2000) NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `ContentReport_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `ContentReport_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `ContentReport_reporterId_idx`(`reporterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModerationAction` (
    `id` CHAR(36) NOT NULL,
    `moderatorId` CHAR(36) NOT NULL,
    `reportId` CHAR(36) NULL,
    `targetType` ENUM('PROGRAM', 'ACTIVITY', 'MEDIA', 'COMMENT', 'USER') NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `action` ENUM('HIDE', 'RESTORE', 'UNLIST', 'RESTRICT_PUBLISHING', 'SUSPEND_USER', 'REVOKE_ACCESS') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,

    INDEX `ModerationAction_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `ModerationAction_moderatorId_idx`(`moderatorId`),
    INDEX `ModerationAction_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboxEvent` (
    `id` CHAR(36) NOT NULL,
    `type` VARCHAR(80) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OutboxEvent_status_availableAt_idx`(`status`, `availableAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IdempotencyKey` (
    `userId` CHAR(36) NOT NULL,
    `scope` VARCHAR(64) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `state` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
    `responseStatus` INTEGER NULL,
    `resultRef` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `IdempotencyKey_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`userId`, `scope`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserProfile` ADD CONSTRAINT `UserProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProfile` ADD CONSTRAINT `UserProfile_avatarMediaId_fkey` FOREIGN KEY (`avatarMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProfile` ADD CONSTRAINT `UserProfile_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserPreference` ADD CONSTRAINT `UserPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthIdentity` ADD CONSTRAINT `AuthIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocalCredential` ADD CONSTRAINT `LocalCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthToken` ADD CONSTRAINT `AuthToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserFollow` ADD CONSTRAINT `UserFollow_followerId_fkey` FOREIGN KEY (`followerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserFollow` ADD CONSTRAINT `UserFollow_followedId_fkey` FOREIGN KEY (`followedId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowRequest` ADD CONSTRAINT `FollowRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowRequest` ADD CONSTRAINT `FollowRequest_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBlock` ADD CONSTRAINT `UserBlock_blockerId_fkey` FOREIGN KEY (`blockerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBlock` ADD CONSTRAINT `UserBlock_blockedId_fkey` FOREIGN KEY (`blockedId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramType` ADD CONSTRAINT `ProgramType_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramType` ADD CONSTRAINT `ProgramType_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Focus` ADD CONSTRAINT `Focus_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Focus` ADD CONSTRAINT `Focus_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramTypeFocus` ADD CONSTRAINT `ProgramTypeFocus_programTypeId_fkey` FOREIGN KEY (`programTypeId`) REFERENCES `ProgramType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramTypeFocus` ADD CONSTRAINT `ProgramTypeFocus_focusId_fkey` FOREIGN KEY (`focusId`) REFERENCES `Focus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityFocus` ADD CONSTRAINT `ActivityFocus_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityFocus` ADD CONSTRAINT `ActivityFocus_focusId_fkey` FOREIGN KEY (`focusId`) REFERENCES `Focus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MetricDefinition` ADD CONSTRAINT `MetricDefinition_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_sourceActivityId_fkey` FOREIGN KEY (`sourceActivityId`) REFERENCES `Activity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_canonicalActivityId_fkey` FOREIGN KEY (`canonicalActivityId`) REFERENCES `Activity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_latestPublishedRevisionId_fkey` FOREIGN KEY (`latestPublishedRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityRevision` ADD CONSTRAINT `ActivityRevision_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityRevision` ADD CONSTRAINT `ActivityRevision_editorId_fkey` FOREIGN KEY (`editorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Instruction` ADD CONSTRAINT `Instruction_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityMetric` ADD CONSTRAINT `ActivityMetric_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ActivityMetric` ADD CONSTRAINT `ActivityMetric_instructionId_fkey` FOREIGN KEY (`instructionId`) REFERENCES `Instruction`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ActivityMetric` ADD CONSTRAINT `ActivityMetric_metricDefinitionId_fkey` FOREIGN KEY (`metricDefinitionId`) REFERENCES `MetricDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityTool` ADD CONSTRAINT `ActivityTool_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ActivityTool` ADD CONSTRAINT `ActivityTool_instructionId_fkey` FOREIGN KEY (`instructionId`) REFERENCES `Instruction`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ActivityTool` ADD CONSTRAINT `ActivityTool_toolDefinitionId_fkey` FOREIGN KEY (`toolDefinitionId`) REFERENCES `ToolDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_programTypeId_fkey` FOREIGN KEY (`programTypeId`) REFERENCES `ProgramType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_focusId_fkey` FOREIGN KEY (`focusId`) REFERENCES `Focus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_latestPublishedVersionId_fkey` FOREIGN KEY (`latestPublishedVersionId`) REFERENCES `ProgramVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramVersion` ADD CONSTRAINT `ProgramVersion_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramVersion` ADD CONSTRAINT `ProgramVersion_programTypeId_fkey` FOREIGN KEY (`programTypeId`) REFERENCES `ProgramType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramVersion` ADD CONSTRAINT `ProgramVersion_focusId_fkey` FOREIGN KEY (`focusId`) REFERENCES `Focus`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramVersion` ADD CONSTRAINT `ProgramVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramScheduleItem` ADD CONSTRAINT `ProgramScheduleItem_programVersionId_fkey` FOREIGN KEY (`programVersionId`) REFERENCES `ProgramVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramScheduleItem` ADD CONSTRAINT `ProgramScheduleItem_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramScheduleItem` ADD CONSTRAINT `ProgramScheduleItem_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramAccessPolicy` ADD CONSTRAINT `ProgramAccessPolicy_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramPrice` ADD CONSTRAINT `ProgramPrice_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramEnrollment` ADD CONSTRAINT `ProgramEnrollment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramEnrollment` ADD CONSTRAINT `ProgramEnrollment_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramEnrollment` ADD CONSTRAINT `ProgramEnrollment_programVersionId_fkey` FOREIGN KEY (`programVersionId`) REFERENCES `ProgramVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramEnrollment` ADD CONSTRAINT `ProgramEnrollment_pendingVersionId_fkey` FOREIGN KEY (`pendingVersionId`) REFERENCES `ProgramVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramEnrollment` ADD CONSTRAINT `ProgramEnrollment_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProgramGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramAccessGrant` ADD CONSTRAINT `ProgramAccessGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramAccessGrant` ADD CONSTRAINT `ProgramAccessGrant_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramApprovalRequest` ADD CONSTRAINT `ProgramApprovalRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramApprovalRequest` ADD CONSTRAINT `ProgramApprovalRequest_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramSource` ADD CONSTRAINT `ProgramSource_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramSource` ADD CONSTRAINT `ProgramSource_sourceProgramVersionId_fkey` FOREIGN KEY (`sourceProgramVersionId`) REFERENCES `ProgramVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramSource` ADD CONSTRAINT `ProgramSource_copiedById_fkey` FOREIGN KEY (`copiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramStat` ADD CONSTRAINT `ProgramStat_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreatorPayoutAccount` ADD CONSTRAINT `CreatorPayoutAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramPurchase` ADD CONSTRAINT `ProgramPurchase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramPurchase` ADD CONSTRAINT `ProgramPurchase_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramPurchase` ADD CONSTRAINT `ProgramPurchase_priceId_fkey` FOREIGN KEY (`priceId`) REFERENCES `ProgramPrice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingSubscription` ADD CONSTRAINT `BillingSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingSubscription` ADD CONSTRAINT `BillingSubscription_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingSubscription` ADD CONSTRAINT `BillingSubscription_priceId_fkey` FOREIGN KEY (`priceId`) REFERENCES `ProgramPrice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarRecurrence` ADD CONSTRAINT `CalendarRecurrence_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarRecurrence` ADD CONSTRAINT `CalendarRecurrence_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarRecurrence` ADD CONSTRAINT `CalendarRecurrence_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `ProgramEnrollment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_sourceScheduleItemId_fkey` FOREIGN KEY (`sourceScheduleItemId`) REFERENCES `ProgramScheduleItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarItem` ADD CONSTRAINT `CalendarItem_recurrenceId_fkey` FOREIGN KEY (`recurrenceId`) REFERENCES `CalendarRecurrence`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivitySession` ADD CONSTRAINT `ActivitySession_calendarItemId_fkey` FOREIGN KEY (`calendarItemId`) REFERENCES `CalendarItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivitySession` ADD CONSTRAINT `ActivitySession_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivitySession` ADD CONSTRAINT `ActivitySession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResultEntry` ADD CONSTRAINT `ResultEntry_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ActivitySession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResultEntry` ADD CONSTRAINT `ResultEntry_instructionId_fkey` FOREIGN KEY (`instructionId`) REFERENCES `Instruction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResultMetricValue` ADD CONSTRAINT `ResultMetricValue_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `ResultEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResultMetricValue` ADD CONSTRAINT `ResultMetricValue_metricDefinitionId_fkey` FOREIGN KEY (`metricDefinitionId`) REFERENCES `MetricDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAchievement` ADD CONSTRAINT `UserAchievement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAchievement` ADD CONSTRAINT `UserAchievement_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `AchievementDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAchievement` ADD CONSTRAINT `UserAchievement_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `ProgramEnrollment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAchievement` ADD CONSTRAINT `UserAchievement_sourceCalendarItemId_fkey` FOREIGN KEY (`sourceCalendarItemId`) REFERENCES `CalendarItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramGroup` ADD CONSTRAINT `ProgramGroup_programVersionId_fkey` FOREIGN KEY (`programVersionId`) REFERENCES `ProgramVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramGroup` ADD CONSTRAINT `ProgramGroup_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupMember` ADD CONSTRAINT `GroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProgramGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupMember` ADD CONSTRAINT `GroupMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupInvitation` ADD CONSTRAINT `GroupInvitation_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProgramGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupInvitation` ADD CONSTRAINT `GroupInvitation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupInvitation` ADD CONSTRAINT `GroupInvitation_invitedUserId_fkey` FOREIGN KEY (`invitedUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionShare` ADD CONSTRAINT `CompletionShare_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProgramGroup`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionShare` ADD CONSTRAINT `CompletionShare_calendarItemId_fkey` FOREIGN KEY (`calendarItemId`) REFERENCES `CalendarItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionShare` ADD CONSTRAINT `CompletionShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionShare` ADD CONSTRAINT `CompletionShare_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionReaction` ADD CONSTRAINT `CompletionReaction_completionShareId_fkey` FOREIGN KEY (`completionShareId`) REFERENCES `CompletionShare`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompletionReaction` ADD CONSTRAINT `CompletionReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaVariant` ADD CONSTRAINT `MediaVariant_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAttachment` ADD CONSTRAINT `MediaAttachment_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAttachment` ADD CONSTRAINT `MediaAttachment_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MediaAttachment` ADD CONSTRAINT `MediaAttachment_activityRevisionId_fkey` FOREIGN KEY (`activityRevisionId`) REFERENCES `ActivityRevision`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MediaAttachment` ADD CONSTRAINT `MediaAttachment_instructionId_fkey` FOREIGN KEY (`instructionId`) REFERENCES `Instruction`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MediaAttachment` ADD CONSTRAINT `MediaAttachment_resultEntryId_fkey` FOREIGN KEY (`resultEntryId`) REFERENCES `ResultEntry`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MediaAttachment` ADD CONSTRAINT `MediaAttachment_userProfileId_fkey` FOREIGN KEY (`userProfileId`) REFERENCES `UserProfile`(`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MediaPublication` ADD CONSTRAINT `MediaPublication_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaPublication` ADD CONSTRAINT `MediaPublication_publishedById_fkey` FOREIGN KEY (`publishedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaPublication` ADD CONSTRAINT `MediaPublication_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaPublication` ADD CONSTRAINT `MediaPublication_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProgramGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaPublication` ADD CONSTRAINT `MediaPublication_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaPublication` ADD CONSTRAINT `MediaPublication_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaReaction` ADD CONSTRAINT `MediaReaction_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `MediaPublication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaReaction` ADD CONSTRAINT `MediaReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaComment` ADD CONSTRAINT `MediaComment_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `MediaPublication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaComment` ADD CONSTRAINT `MediaComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicationView` ADD CONSTRAINT `PublicationView_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `MediaPublication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReminderDispatch` ADD CONSTRAINT `ReminderDispatch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentReport` ADD CONSTRAINT `ContentReport_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModerationAction` ADD CONSTRAINT `ModerationAction_moderatorId_fkey` FOREIGN KEY (`moderatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModerationAction` ADD CONSTRAINT `ModerationAction_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `ContentReport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IdempotencyKey` ADD CONSTRAINT `IdempotencyKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Hand-written constraints Prisma cannot express (05-ARCHITECTURE §8) ─────

-- 08-ACTIVITIES: a metric or tool binds to exactly one of revision or instruction
ALTER TABLE `ActivityMetric` ADD CONSTRAINT `ActivityMetric_one_target`
  CHECK ((`activityRevisionId` IS NULL) <> (`instructionId` IS NULL));
ALTER TABLE `ActivityTool` ADD CONSTRAINT `ActivityTool_one_target`
  CHECK ((`activityRevisionId` IS NULL) <> (`instructionId` IS NULL));

-- 09-CALENDARS: exactly one typed value on a result
ALTER TABLE `ResultMetricValue` ADD CONSTRAINT `ResultMetricValue_one_value`
  CHECK ((`intValue` IS NOT NULL) + (`decimalValue` IS NOT NULL) + (`boolValue` IS NOT NULL)
       + (`textValue` IS NOT NULL) + (`durationSeconds` IS NOT NULL) = 1);

-- 11-MEDIA: an attachment has exactly one target
ALTER TABLE `MediaAttachment` ADD CONSTRAINT `MediaAttachment_one_target`
  CHECK ((`programId` IS NOT NULL) + (`activityRevisionId` IS NOT NULL) + (`instructionId` IS NOT NULL)
       + (`resultEntryId` IS NOT NULL) + (`userProfileId` IS NOT NULL) = 1);
