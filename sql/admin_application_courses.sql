create table if not exists public.application_course_changes (
  id uuid primary key default gen_random_uuid(), application_id uuid not null,
  previous_course_id uuid, next_course_id uuid not null,
  changed_at timestamptz not null default now(), changed_by uuid not null default auth.uid()
);
alter table public.application_course_changes enable row level security;
revoke all on public.application_course_changes from public,anon,authenticated;
grant select,insert on public.application_course_changes to authenticated;
create policy application_course_changes_admin on public.application_course_changes to authenticated
  using(public.current_user_is_admin()) with check(public.current_user_is_admin());
create or replace function public.admin_save_application_course(p_trainee_id uuid,p_course_id uuid,p_application_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.applications; result_id uuid; next_attempt integer; category text;
begin
  if auth.uid() is null or not public.current_user_is_admin() then raise exception 'not authorized'; end if;
  perform 1 from public.trainees where id=p_trainee_id for update;
  if not found then raise exception '신청자를 찾지 못했습니다'; end if;
  perform 1 from public.courses where id=p_course_id;
  if not found then raise exception '회차를 찾지 못했습니다'; end if;
  if p_application_id is not null then
    select * into existing from public.applications where id=p_application_id and trainee_id=p_trainee_id for update;
    if not found then raise exception '신청 건을 찾지 못했습니다'; end if;
    if existing.course_id=p_course_id then return existing.id; end if;
    if existing.status='수료' or existing.certificate_issued or exists(select 1 from public.certificate_documents where existing.id=any(application_ids)) then
      raise exception '수료 또는 수료증 발급 이력이 있는 신청은 변경할 수 없습니다. 추가 신청을 사용해주세요';
    end if;
  end if;
  select coalesce(max(a.attempt_no),0)+1 into next_attempt from public.applications a
    join public.courses c on c.id=a.course_id
    where a.trainee_id=p_trainee_id and c.course_type_id=(select course_type_id from public.courses where id=p_course_id);
  if p_application_id is null then
    select employment_category into category from public.applications where trainee_id=p_trainee_id order by applied_at desc limit 1;
    insert into public.applications(trainee_id,course_id,status,attempt_no,employment_category)
      values(p_trainee_id,p_course_id,'대기',next_attempt,category) returning id into result_id;
  else
    update public.applications set course_id=p_course_id,attempt_no=next_attempt,part_a_completed=false,part_b_completed=false where id=existing.id;
    result_id:=existing.id;
  end if;
  insert into public.application_course_changes(application_id,previous_course_id,next_course_id)
    values(result_id,existing.course_id,p_course_id);
  return result_id;
end $$;
revoke all on function public.admin_save_application_course(uuid,uuid,uuid) from public,anon;
grant execute on function public.admin_save_application_course(uuid,uuid,uuid) to authenticated;
