-- Supabase patch for the 2026 KHP training application.
-- Project ref verified through MCP: siwatwgncoiknnkglvok
-- Existing table model:
--   course_types     fixed subjects such as drone or generative AI
--   courses          rounds connected to a fixed subject
--   trainees         unique applicants
--   applications     application records per applicant and round

alter table public.trainees
  add column if not exists company text,
  add column if not exists birth6 text,
  add column if not exists resident_number_hash text,
  add column if not exists agreement_confirmed boolean default false,
  add column if not exists noshow_confirmed boolean default false,
  add column if not exists referral_sources text[] default '{}',
  add column if not exists note text,
  add column if not exists admin_memo text;

create unique index if not exists trainees_resident_number_hash_uidx
on public.trainees (resident_number_hash)
where resident_number_hash is not null;

do $block$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'trainee_rrn_key';

  if v_key is null then
    raise exception '암호화 키 설정 오류';
  end if;

  update public.trainees
  set resident_number_hash = encode(hmac(pgp_sym_decrypt(resident_number_enc, v_key), v_key, 'sha256'), 'hex')
  where resident_number_hash is null
    and resident_number_enc is not null;
end;
$block$;

alter table public.courses
  add column if not exists is_open boolean not null default true;

alter table public.applications
  add column if not exists attempt_no integer not null default 1,
  add column if not exists status_updated_at timestamptz,
  add column if not exists status_updated_by text,
  add column if not exists cancelled_at timestamptz;

create or replace function public.set_application_status_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    new.status_updated_at := now();
    new.status_updated_by := auth.jwt() ->> 'email';
    if new.status = '취소' and old.status is distinct from '취소' then
      new.cancelled_at := now();
    elsif new.status is distinct from '취소' then
      new.cancelled_at := null;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_application_status_audit on public.applications;
create trigger trg_application_status_audit
before update of status on public.applications
for each row
execute function public.set_application_status_audit();

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.admins
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$function$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon, authenticated;

drop policy if exists course_types_public_select on public.course_types;
create policy course_types_public_select
on public.course_types
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.course_type_id = course_types.id
      and coalesce(c.is_open, true) = true
  )
  or public.current_user_is_admin()
);

drop policy if exists admins_authenticated_read on public.admins;
drop policy if exists admins_admin_read on public.admins;
create policy admins_admin_read
on public.admins
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists applications_public_insert on public.applications;

drop policy if exists courses_public_select on public.courses;
create policy courses_public_select
on public.courses
for select
to anon, authenticated
using (coalesce(is_open, true) = true or public.current_user_is_admin());

drop policy if exists applications_admin_all on public.applications;
create policy applications_admin_all
on public.applications
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists trainees_admin_all on public.trainees;
create policy trainees_admin_all
on public.trainees
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists courses_admin_all on public.courses;
create policy courses_admin_all
on public.courses
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists course_types_admin_all on public.course_types;
create policy course_types_admin_all
on public.course_types
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists rrn_log_admin_read on public.rrn_access_log;
create policy rrn_log_admin_read
on public.rrn_access_log
for select
to authenticated
using (public.current_user_is_admin());

create or replace function public.submit_application(
  p_name text,
  p_phone text,
  p_email text,
  p_company text,
  p_birth6 text,
  p_resident_number text,
  p_employed boolean,
  p_privacy boolean,
  p_agreement_confirmed boolean,
  p_noshow_confirmed boolean,
  p_referral_sources text[],
  p_note text,
  p_course_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_key text;
  v_digits text;
  v_hash text;
  v_trainee_id uuid;
  v_course record;
  v_existing_count integer;
  v_inserted_count integer := 0;
begin
  v_digits := regexp_replace(coalesce(p_resident_number, ''), '\D', '', 'g');

  if length(v_digits) <> 13 then
    raise exception '주민등록번호 형식이 올바르지 않습니다 (13자리 필요)';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception '이름을 입력해주세요';
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 then
    raise exception '연락처를 입력해주세요';
  end if;
  if p_company is null or length(trim(p_company)) = 0 then
    raise exception '회사명을 입력해주세요';
  end if;
  if p_birth6 is null or p_birth6 !~ '^[0-9]{6}$' then
    raise exception '생년월일 6자리를 입력해주세요';
  end if;
  if coalesce(array_length(p_course_ids, 1), 0) = 0 then
    raise exception '신청할 과정을 1개 이상 선택해주세요';
  end if;
  if not coalesce(p_employed, false) then
    raise exception '재직자 대상 과정임을 확인해주세요';
  end if;
  if not coalesce(p_privacy, false) then
    raise exception '개인정보 수집·이용에 동의가 필요합니다';
  end if;
  if not coalesce(p_agreement_confirmed, false) then
    raise exception '협약서 제출 안내를 확인해주세요';
  end if;
  if not coalesce(p_noshow_confirmed, false) then
    raise exception '취소 및 노쇼 안내를 확인해주세요';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'trainee_rrn_key';

  if v_key is null then
    raise exception '암호화 키 설정 오류';
  end if;

  v_hash := encode(hmac(v_digits, v_key, 'sha256'), 'hex');

  select id into v_trainee_id
  from public.trainees
  where resident_number_hash = v_hash;

  if v_trainee_id is null then
    v_trainee_id := gen_random_uuid();
    insert into public.trainees (
      id, name, phone, email, company, birth6,
      employed_confirmed, privacy_consent, rrn_consent,
      agreement_confirmed, noshow_confirmed, referral_sources, note,
      resident_number_hash, resident_number_enc
    )
    values (
      v_trainee_id,
      trim(p_name),
      trim(p_phone),
      nullif(trim(coalesce(p_email, '')), ''),
      trim(p_company),
      p_birth6,
      p_employed,
      p_privacy,
      true,
      p_agreement_confirmed,
      p_noshow_confirmed,
      coalesce(p_referral_sources, '{}'),
      nullif(trim(coalesce(p_note, '')), ''),
      v_hash,
      pgp_sym_encrypt(v_digits, v_key)
    );
  else
    update public.trainees
    set name = trim(p_name),
        phone = trim(p_phone),
        email = nullif(trim(coalesce(p_email, '')), ''),
        company = trim(p_company),
        birth6 = p_birth6,
        employed_confirmed = p_employed,
        privacy_consent = p_privacy,
        rrn_consent = true,
        agreement_confirmed = p_agreement_confirmed,
        noshow_confirmed = p_noshow_confirmed,
        referral_sources = coalesce(p_referral_sources, '{}'),
        note = nullif(trim(coalesce(p_note, '')), '')
    where id = v_trainee_id;
  end if;

  for v_course in
    select c.id, c.name, c.course_type_id
    from public.courses c
    where c.id = any(p_course_ids)
      and coalesce(c.is_open, true) = true
    order by c.start_date nulls last, c.name
  loop
    select count(*) into v_existing_count
    from public.applications a
    join public.courses c on c.id = a.course_id
    where a.trainee_id = v_trainee_id
      and c.course_type_id is not distinct from v_course.course_type_id
      and a.status <> '취소';

    if v_existing_count >= 2 then
      raise exception '% 과정은 취소되지 않은 신청/수강 건이 이미 2건입니다', v_course.name;
    end if;

    insert into public.applications (trainee_id, course_id, attempt_no)
    values (v_trainee_id, v_course.id, v_existing_count + 1);

    v_inserted_count := v_inserted_count + 1;
  end loop;

  if v_inserted_count = 0 then
    raise exception '현재 신청 가능한 과정이 없습니다';
  end if;

  return v_trainee_id;
end;
$function$;

grant execute on function public.submit_application(
  text,text,text,text,text,text,boolean,boolean,boolean,boolean,text[],text,uuid[]
) to anon, authenticated;
