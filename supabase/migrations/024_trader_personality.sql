-- Optional trading personality / strategy text for LLM-assisted deal selection
alter table traders
  add column personality text;

comment on column traders.personality is
  'Short strategy description injected into deal-selection LLM (e.g. aggressive vs cautious).';
