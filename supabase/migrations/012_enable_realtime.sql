-- Enable Supabase Realtime on tables needed for live dashboard updates
alter publication supabase_realtime add table deals;
alter publication supabase_realtime add table deal_outcomes;
alter publication supabase_realtime add table deal_approvals;
alter publication supabase_realtime add table traders;
