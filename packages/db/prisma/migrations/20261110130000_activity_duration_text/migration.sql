-- Activity duration text attribute on Activity and immutable ActivityRevision snapshot.
ALTER TABLE `Activity` ADD COLUMN `duration` VARCHAR(80) NULL;
ALTER TABLE `ActivityRevision` ADD COLUMN `durationSnapshot` VARCHAR(80) NULL;

