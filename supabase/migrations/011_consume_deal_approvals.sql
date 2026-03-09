-- Allow approvals to be consumed exactly once by the agent cycle.

alter table deal_approvals
  drop constraint if exists deal_approvals_status_check;

alter table deal_approvals
  add constraint deal_approvals_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'consumed'));
