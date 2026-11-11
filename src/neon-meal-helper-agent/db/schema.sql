-- Idempotent schema. Apply with `npm run db:migrate`.
-- Every row belongs to a Neon Auth user and is removed with them.

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  title text not null,
  description text not null default '',
  servings integer,
  prep_minutes integer,
  cook_minutes integer,
  -- [{ name, quantity, unit, note }]
  ingredients jsonb not null default '[]',
  -- [string]
  steps jsonb not null default '[]',
  tags text[] not null default '{}',
  source text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_user_idx on recipes (user_id, updated_at desc);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  recipe_id uuid references recipes(id) on delete set null,
  name text not null,
  content_type text not null,
  size_bytes integer not null,
  storage_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists files_user_idx on files (user_id, created_at desc);

create table if not exists meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references recipes(id) on delete set null,
  title text not null,
  servings integer,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists meal_plan_user_date_idx on meal_plan_entries (user_id, date);

create table if not exists grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grocery_lists_user_idx on grocery_lists (user_id, updated_at desc);

create table if not exists grocery_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references grocery_lists(id) on delete cascade,
  name text not null,
  quantity double precision,
  unit text not null default '',
  category text not null default '',
  checked boolean not null default false,
  recipe_id uuid references recipes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists grocery_items_list_idx on grocery_items (list_id, created_at);

create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  name text not null,
  quantity double precision,
  unit text not null default '',
  category text not null default '',
  expires_on date,
  notes text not null default '',
  updated_at timestamptz not null default now()
);
create unique index if not exists pantry_items_user_name_idx on pantry_items (user_id, lower(name));

-- One continuous chat per user. `message` is a Pi AgentMessage
-- (user, assistant, or toolResult).
create table if not exists chat_messages (
  id bigserial primary key,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  message jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_user_idx on chat_messages (user_id, id);
