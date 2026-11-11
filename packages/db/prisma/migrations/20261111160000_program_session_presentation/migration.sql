-- Allow Programs and ProgramVersions to specify Calendar session presentation (SEPARATE vs GROUPED).
ALTER TABLE `Program`
    ADD COLUMN `sessionPresentation` ENUM('SEPARATE', 'GROUPED') NOT NULL DEFAULT 'SEPARATE';

ALTER TABLE `ProgramVersion`
    ADD COLUMN `sessionPresentation` ENUM('SEPARATE', 'GROUPED') NOT NULL DEFAULT 'SEPARATE';

