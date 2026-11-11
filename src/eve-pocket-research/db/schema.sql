create table if not exists research_items (
  session_id text primary key,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_items_updated_at_idx on research_items (updated_at desc);
