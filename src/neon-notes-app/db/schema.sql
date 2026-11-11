create table notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  key text not null unique,
  filename text not null,
  content_type text not null,
  size bigint not null,
  created_at timestamptz not null default now()
);

create index attachments_note_id_idx on attachments (note_id);

create table chats (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chats_updated_at_idx on chats (updated_at desc);

create table messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null references chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_chat_id_idx on messages (chat_id, id);

-- Auth: every note and chat belongs to a Neon Auth user.
alter table notes add column user_id uuid not null references neon_auth."user"(id) on delete cascade;
alter table chats add column user_id uuid not null references neon_auth."user"(id) on delete cascade;
create index notes_user_id_idx on notes (user_id, created_at desc);
create index chats_user_id_idx on chats (user_id, updated_at desc);
