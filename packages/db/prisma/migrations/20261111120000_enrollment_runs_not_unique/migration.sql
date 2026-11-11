-- A person may run a Program several times (07-PROGRAMS Runs): enrollments are no longer unique per user and Program.
DROP INDEX `ProgramEnrollment_activeKey_key` ON `ProgramEnrollment`;
