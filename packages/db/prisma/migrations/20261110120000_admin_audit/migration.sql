-- Platform administration audit (12-SOCIAL §7a): admin action kinds, and a nullable actor for
-- server-side commands (initial admin bootstrap). The foreign key stays RESTRICT.
ALTER TABLE `ModerationAction` MODIFY `moderatorId` CHAR(36) NULL,
    MODIFY `action` ENUM('HIDE', 'RESTORE', 'UNLIST', 'RESTRICT_PUBLISHING', 'SUSPEND_USER', 'REVOKE_ACCESS', 'ROLE_CHANGE', 'PUBLISH', 'ARCHIVE', 'DELETE') NOT NULL;
