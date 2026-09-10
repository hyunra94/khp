-- Certificate snapshots and original artwork are admin-only.
create table if not exists public.certificate_artwork (
  id text primary key,
  png_base64 text not null
);
create table if not exists public.certificate_documents (
  id uuid primary key default gen_random_uuid(),
  application_ids uuid[] not null,
  source_key text unique not null,
  certificate_number text unique not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  issued_at timestamptz,
  last_download_at timestamptz,
  download_count integer not null default 0
);
alter table public.certificate_artwork enable row level security;
alter table public.certificate_documents enable row level security;
revoke all on public.certificate_artwork, public.certificate_documents from public, anon, authenticated;
grant select on public.certificate_artwork to authenticated;
grant select, insert on public.certificate_documents to authenticated;
grant update(issued_at,last_download_at,download_count) on public.certificate_documents to authenticated;
drop policy if exists certificate_artwork_admin on public.certificate_artwork;
create policy certificate_artwork_admin on public.certificate_artwork for select to authenticated
using (public.current_user_is_admin());
drop policy if exists certificate_documents_admin on public.certificate_documents;
create policy certificate_documents_admin on public.certificate_documents for all to authenticated
using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create sequence if not exists public.certificate_document_number_seq;
revoke all on sequence public.certificate_document_number_seq from public, anon;
grant usage on sequence public.certificate_document_number_seq to authenticated;
select setval('public.certificate_document_number_seq', greatest(
  (select last_value from public.certificate_document_number_seq),
  coalesce((select max(substring(certificate_number from '[0-9]+$')::bigint)
    from public.applications where length(substring(certificate_number from '[0-9]+$')) < 9), 1)
));

-- Decrypt only on the server; never send the full resident number to the PDF module.
create schema if not exists certificate_private;
revoke all on schema certificate_private from public, anon;
grant usage on schema certificate_private to authenticated;
create or replace function certificate_private.birth_date(p_trainee_id uuid)
returns date language plpgsql security definer set search_path = '' as $$
declare v_key text; v_digits text; v_year integer;
begin
  if auth.uid() is null or not public.current_user_is_admin() then raise exception 'not authorized'; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name='trainee_rrn_key';
  select regexp_replace(extensions.pgp_sym_decrypt(resident_number_enc,v_key),'[^0-9]','','g')
    into v_digits from public.trainees where id=p_trainee_id;
  if v_digits is null or length(v_digits) <> 13 then return null; end if;
  v_year := case substring(v_digits,7,1)
    when '1' then 1900 when '2' then 1900 when '5' then 1900 when '6' then 1900
    when '3' then 2000 when '4' then 2000 when '7' then 2000 when '8' then 2000
    when '9' then 1800 when '0' then 1800 else null end;
  insert into public.rrn_access_log(trainee_id,accessed_by,revealed_full)
    values(p_trainee_id,auth.jwt()->>'email',false);
  return make_date(v_year+substring(v_digits,1,2)::integer,substring(v_digits,3,2)::integer,substring(v_digits,5,2)::integer);
end $$;
revoke all on function certificate_private.birth_date(uuid) from public, anon;
grant execute on function certificate_private.birth_date(uuid) to authenticated;
create or replace function public.certificate_birth_date(p_trainee_id uuid)
returns date language sql security invoker set search_path = ''
as $$ select certificate_private.birth_date(p_trainee_id) $$;
revoke all on function public.certificate_birth_date(uuid) from public, anon;
grant execute on function public.certificate_birth_date(uuid) to authenticated;

create or replace function public.prepare_certificate_document(p_application_ids uuid[], p_snapshot jsonb)
returns public.certificate_documents language plpgsql security invoker set search_path = '' as $$
declare v_ids uuid[]; v_key text; v_doc public.certificate_documents; v_count integer;
  v_trainees integer; v_types integer; v_number text; v_year text; v_parts text; v_existing_numbers integer;
begin
  if auth.uid() is null or not public.current_user_is_admin() then raise exception 'not authorized'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_application_ids) x;
  if coalesce(cardinality(v_ids),0)=0 then raise exception '발급 대상을 선택해주세요'; end if;
  select count(*),count(distinct a.trainee_id),count(distinct c.course_type_id)
    into v_count,v_trainees,v_types from public.applications a join public.courses c on c.id=a.course_id
    where a.id=any(v_ids) and a.status='수료';
  if v_count<>cardinality(v_ids) or v_trainees<>1 or v_types<>1 then raise exception '동일 신청자·과정의 수료 건만 함께 발급할 수 있습니다'; end if;
  select case when bool_or(ct.has_parts) then
    (case when bool_or(a.part_a_completed) then 'A' else '' end) ||
    (case when bool_or(a.part_b_completed) then 'B' else '' end) else 'single' end
    into v_parts from public.applications a join public.courses c on c.id=a.course_id
    join public.course_types ct on ct.id=c.course_type_id where a.id=any(v_ids);
  if v_parts='' or (p_snapshot->>'parts') is distinct from v_parts then raise exception 'A/B 이수 정보를 새로고침한 뒤 다시 확인해주세요'; end if;
  v_key := array_to_string(v_ids,',') || ':' || v_parts;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_doc from public.certificate_documents where source_key=v_key;
  if found then return v_doc; end if;
  if coalesce(length(trim(p_snapshot->>'name')),0)=0
    or coalesce(jsonb_array_length(p_snapshot->'courseNames'),0) not between 1 and 2
    or nullif(p_snapshot->>'birthDate','') is null
    or nullif(p_snapshot->>'startDate','') is null or nullif(p_snapshot->>'endDate','') is null then
    raise exception '성명, 생년월일, 과정명, 훈련기간을 확인해주세요';
  end if;
  if (p_snapshot->>'startDate')::date > (p_snapshot->>'endDate')::date then raise exception '훈련기간을 확인해주세요'; end if;
  perform (p_snapshot->>'birthDate')::date;
  v_year := extract(year from (p_snapshot->>'endDate')::date)::text;
  select count(distinct nullif(trim(certificate_number),'')),min(nullif(trim(certificate_number),''))
    into v_existing_numbers,v_number from public.applications where id=any(v_ids);
  if v_existing_numbers<>1 or exists(select 1 from public.certificate_documents where certificate_number=v_number) then
    loop
      v_number := nextval('public.certificate_document_number_seq')::text;
      v_number := v_year || '-' || repeat('0',greatest(0,4-length(v_number))) || v_number;
      exit when not exists(select 1 from public.certificate_documents where certificate_number=v_number)
        and not exists(select 1 from public.applications where certificate_number=v_number);
    end loop;
  end if;
  insert into public.certificate_documents(application_ids,source_key,certificate_number,snapshot)
    values(v_ids,v_key,v_number,p_snapshot) returning * into v_doc;
  return v_doc;
end $$;
revoke all on function public.prepare_certificate_document(uuid[],jsonb) from public, anon;
grant execute on function public.prepare_certificate_document(uuid[],jsonb) to authenticated;

create or replace function public.complete_certificate_document(p_document_id uuid)
returns public.certificate_documents language plpgsql security invoker set search_path = '' as $$
declare v_doc public.certificate_documents; v_first boolean;
begin
  if auth.uid() is null or not public.current_user_is_admin() then raise exception 'not authorized'; end if;
  select * into v_doc from public.certificate_documents where id=p_document_id for update;
  if not found then raise exception '수료증 기록을 찾지 못했습니다'; end if;
  v_first := v_doc.issued_at is null;
  update public.certificate_documents set issued_at=coalesce(issued_at,now()),last_download_at=now(),download_count=download_count+1
    where id=p_document_id returning * into v_doc;
  if not found then raise exception '수료증 기록을 찾지 못했습니다'; end if;
  if v_first then
    update public.applications set certificate_issued=true,certificate_number=v_doc.certificate_number,
      certificate_issued_at=v_doc.issued_at where id=any(v_doc.application_ids);
  end if;
  return v_doc;
end $$;
revoke all on function public.complete_certificate_document(uuid) from public, anon;
grant execute on function public.complete_certificate_document(uuid) to authenticated;
