-- Team members were being created with plan='trial' and a 7-day trial_ends_at
-- by the handle_new_user() auth trigger, and the add-member flow never
-- overwrote those fields. After 7 days the team member's own trial_ends_at
-- expired even though the team owner was on Enterprise, blurring the
-- visitors/audiences pages for them.
--
-- Backfill every existing team member so plan and trial_ends_at match their
-- team owner. Only touches rows that differ to keep the diff minimal.

UPDATE users AS member
SET
  plan = owner.plan,
  trial_ends_at = owner.trial_ends_at,
  updated_at = NOW()
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
JOIN users owner ON owner.id = t.owner_user_id
WHERE member.id = tm.user_id
  AND (
    member.plan IS DISTINCT FROM owner.plan
    OR member.trial_ends_at IS DISTINCT FROM owner.trial_ends_at
  );
