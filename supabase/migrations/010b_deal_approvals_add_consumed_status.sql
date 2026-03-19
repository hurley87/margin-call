-- Add 'consumed' as a valid approval status for one-time-use approvals
alter table deal_approvals drop constraint if exists deal_approvals_status_check;
alter table deal_approvals add constraint deal_approvals_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'consumed'));
