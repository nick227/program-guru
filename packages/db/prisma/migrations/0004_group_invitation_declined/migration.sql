-- Invitees can decline a USER or EMAIL invitation (10-COLLABORATION.md §3). Additive enum value.
ALTER TABLE `GroupInvitation` MODIFY `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'PENDING';
