-- Link deals to the wire headline they were created from
alter table deals add column source_headline text;
create index idx_deals_source_headline on deals(source_headline) where source_headline is not null;
