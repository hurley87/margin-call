-- Agent activity log for tracking autonomous trade cycle actions
CREATE TABLE agent_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- scan, evaluate, skip, enter, win, loss, wipeout, pause, resume, error, cycle_start, cycle_end
  message TEXT NOT NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_trader ON agent_activity_log(trader_id, created_at DESC);
CREATE INDEX idx_activity_log_type ON agent_activity_log(activity_type);

-- Enable realtime for activity log
ALTER PUBLICATION supabase_realtime ADD TABLE agent_activity_log;
