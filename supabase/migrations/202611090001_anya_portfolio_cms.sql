-- Anya-only objects. Apply deliberately; this does not grant any existing user access.
begin;

create schema if not exists private;

create table private.anya_portfolio_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.anya_portfolio_editors enable row level security;
revoke all on private.anya_portfolio_editors from public, anon, authenticated;

create function public.anya_is_editor()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.anya_portfolio_editors where user_id = (select auth.uid())
  );
$$;
revoke all on function public.anya_is_editor() from public, anon;
grant execute on function public.anya_is_editor() to authenticated;

-- These mirror the reader's URL/required-text/control-character requirements.
-- A direct authenticated RPC must not be able to save an unreadable document.
create function public.anya_text_length(value text)
returns integer language sql immutable set search_path = ''
as $$
  -- HTML maxlength and JavaScript count UTF-16 units, not Unicode code points.
  select length(value) + (select count(*)::integer from regexp_matches(value, '[\U00010000-\U0010FFFF]', 'g'));
$$;
create function public.anya_http_url_is_valid(value text)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  authority text;
  hostname text;
  port text;
  address inet;
begin
  if value is null or public.anya_text_length(value) > 2048 or value ~ '[[:space:][:cntrl:]]'
     or position(chr(92) in value) > 0 then return false; end if;
  authority := substring(value from '^https?://([^/?#]+)');
  if authority is null or position('@' in authority) > 0 then return false; end if;
  if left(authority, 1) = '[' then
    hostname := substring(authority from '^\[([^]]+)\]');
    if hostname is null then return false; end if;
    port := substring(authority from '^\[[^]]+\](.*)$');
    address := hostname::inet;
    if family(address) <> 6 then return false; end if;
  else
    hostname := split_part(authority, ':', 1);
    port := substring(authority from '^[^:]+(.*)$');
    if hostname !~ '^[a-zA-Z0-9._-]+$' then return false; end if;
    if rtrim(hostname, '.') ~ '(^|\.)([0-9]+|0[xX][0-9a-fA-F]+)$' then
      if hostname !~ '^[0-9.]+$' then return false; end if;
      address := hostname::inet;
      if family(address) <> 4 then return false; end if;
    end if;
  end if;
  if port <> '' and (port !~ '^:[0-9]{1,5}$' or substring(port from 2)::integer > 65535) then return false; end if;
  return true;
exception when others then return false;
end;
$$;
create function public.anya_has_text(value text)
returns boolean language sql immutable set search_path = ''
as $$ select value ~ '[^\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]' $$;
create function public.anya_safe_text(value text)
returns boolean language sql immutable set search_path = ''
as $$ select value !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F]' $$;
revoke all on function public.anya_text_length(text), public.anya_http_url_is_valid(text), public.anya_has_text(text), public.anya_safe_text(text) from public, anon, authenticated;

create function public.anya_document_is_valid(doc jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  item jsonb;
  ids text[] := '{}';
  used_ids text[] := '{}';
  total_length integer := 0;
  paragraph_text text := '';
begin
  if jsonb_typeof(doc) is distinct from 'object' or doc->'version' is distinct from '1'::jsonb
     or jsonb_typeof(doc->'segments') is distinct from 'array'
     or jsonb_typeof(doc->'links') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'segments') > 500 or jsonb_array_length(doc->'links') > 50 then return false; end if;

  for item in select value from jsonb_array_elements(doc->'links') loop
    if jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item->'id') is distinct from 'string'
       or (item->>'id') !~ '^[a-zA-Z0-9_-]{1,64}$'
       or (item->>'id') = any(ids)
       or jsonb_typeof(item->'href') is distinct from 'string'
       or not public.anya_http_url_is_valid(item->>'href')
       or jsonb_typeof(item->'title') is distinct from 'string'
       or not public.anya_has_text(item->>'title') or public.anya_text_length(item->>'title') > 160
       or jsonb_typeof(item->'summary') is distinct from 'string' or public.anya_text_length(item->>'summary') > 600
       or jsonb_typeof(item->'imageAlt') is distinct from 'string' or public.anya_text_length(item->>'imageAlt') > 200
       or not public.anya_safe_text(item->>'title') or not public.anya_safe_text(item->>'summary')
       or not public.anya_safe_text(item->>'imageAlt') or not (item ? 'image') then return false; end if;
    ids := array_append(ids, item->>'id');
    if item->'image' <> 'null'::jsonb then
      if jsonb_typeof(item->'image') is distinct from 'object'
         or not public.anya_has_text(item->>'imageAlt') then return false; end if;
      if item->'image'->>'kind' = 'bundled' then
        if item->'image'->>'id' is null or item->'image'->>'id' not in ('tvm', 'post-credits') then return false; end if;
      elsif item->'image'->>'kind' = 'upload' then
        if jsonb_typeof(item->'image'->'id') is distinct from 'string'
           or (item->'image'->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
      else return false;
      end if;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(doc->'segments') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'text') is distinct from 'string'
       or not public.anya_safe_text(item->>'text') then return false; end if;
    total_length := total_length + public.anya_text_length(item->>'text');
    paragraph_text := paragraph_text || (item->>'text');
    if item ? 'linkId' then
      if jsonb_typeof(item->'linkId') is distinct from 'string'
         or length(item->>'text') = 0 or not ((item->>'linkId') = any(ids)) then return false; end if;
      used_ids := array_append(used_ids, item->>'linkId');
    end if;
  end loop;
  return total_length between 1 and 20000 and public.anya_has_text(paragraph_text) and ids <@ used_ids;
exception when others then return false;
end;
$$;
revoke all on function public.anya_document_is_valid(jsonb) from public, anon, authenticated;

create table public.anya_portfolio_content (
  id boolean primary key default true check (id),
  document jsonb not null check (public.anya_document_is_valid(document)),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.anya_portfolio_content enable row level security;
revoke all on public.anya_portfolio_content from public, anon, authenticated;
grant select (id, document, revision, updated_at) on public.anya_portfolio_content to anon, authenticated;
create policy anya_public_read on public.anya_portfolio_content for select to anon, authenticated using (true);

create table public.anya_portfolio_assets (
  id uuid primary key,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'ready', 'published')),
  width integer check (width between 1 and 1024),
  height integer check (height between 1 and 1024),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  check (status = 'pending' or (width is not null and height is not null and sha256 is not null))
);
create index anya_portfolio_assets_created_by_idx on public.anya_portfolio_assets(created_by);
alter table public.anya_portfolio_assets enable row level security;
revoke all on public.anya_portfolio_assets from public, anon, authenticated;
-- Only the server, after checking this site's editor membership, can attest image validation.
grant select, insert, update on public.anya_portfolio_assets to service_role;

create function public.anya_publish_portfolio(p_document jsonb, p_revision integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_revision integer;
  published_at timestamptz := now();
  image_id uuid;
begin
  if not public.anya_is_editor() then raise exception 'Anya editor access required' using errcode = '42501'; end if;
  if not public.anya_document_is_valid(p_document) then raise exception 'Invalid paragraph' using errcode = '22023'; end if;
  select revision into current_revision from public.anya_portfolio_content where id = true for update;
  if current_revision is null or p_revision is null or current_revision <> p_revision then
    raise exception 'Paragraph revision conflict' using errcode = '40001';
  end if;
  for image_id in
    select distinct (value->'image'->>'id')::uuid from jsonb_array_elements(p_document->'links')
    where value->'image'->>'kind' = 'upload'
  loop
    if not exists (select 1 from public.anya_portfolio_assets where id = image_id and status = 'published') then
      raise exception 'Image not published' using errcode = '22023';
    end if;
  end loop;
  update public.anya_portfolio_content set document = p_document, revision = current_revision + 1,
    updated_at = published_at, updated_by = auth.uid() where id = true;
  return jsonb_build_object('revision', current_revision + 1, 'updated_at', published_at);
end;
$$;
revoke all on function public.anya_publish_portfolio(jsonb, integer) from public, anon;
grant execute on function public.anya_publish_portfolio(jsonb, integer) to authenticated;

insert into public.anya_portfolio_content(document) values ('{
  "version": 1,
  "segments": [
    {"text":"A young media strategist fascinated by what makes audiences watch, click, and act. "},
    {"text":"TVM President.","linkId":"tvm"}, {"text":" "},
    {"text":"Post-Credits Editor-in-Chief.","linkId":"post-credits"}, {"text":" "},
    {"text":"MWS Social media manager.","linkId":"mws"}
  ],
  "links": [
    {"id":"tvm","href":"https://www.tvmtelevision.com/","title":"TVM: Student Television at McGill","summary":"McGill’s student-run television and film organisation, led by Anya as President.","image":{"kind":"bundled","id":"tvm"},"imageAlt":"TVM logo"},
    {"id":"post-credits","href":"https://www.tvmtelevision.com/post-credits","title":"Post-Credits","summary":"TVM’s film magazine, edited by Anya as Editor-in-Chief.","image":{"kind":"bundled","id":"post-credits"},"imageAlt":"Post-Credits magazine cover"},
    {"id":"mws","href":"https://www.instagram.com/mcgillwinesociety/","title":"McGill Wine Society","summary":"McGill Wine Society’s Instagram, managed by Anya.","image":null,"imageAlt":""}
  ]
}'::jsonb);

commit;
