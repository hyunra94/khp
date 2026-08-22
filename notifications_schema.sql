-- ============================================================
-- [Claude] 문자/메일 알림 시스템 - 알림 발송 이력 테이블
-- 이 파일은 Claude가 추가하는 신규 기능 전용 스키마입니다.
-- 기존 supabase_schema.sql은 건드리지 않습니다.
-- 적용: Supabase SQL Editor 또는 `supabase db push` 로 실행
-- ============================================================

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete set null,
  trainee_id uuid references public.trainees(id) on delete set null,
  event_type text not null check (event_type in ('application_received', 'status_change', 'course_reminder')),
  channel text not null check (channel in ('email', 'sms')),
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  recipient text,
  detail text,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.notification_log is '[Claude 추가] 문자/메일 알림 발송 이력. Edge Function(notify-*)이 service_role로 기록.';

create index if not exists idx_notification_log_application on public.notification_log (application_id, event_type);
create index if not exists idx_notification_log_created_at on public.notification_log (created_at desc);

alter table public.notification_log enable row level security;

revoke all on table public.notification_log from anon;
revoke all on table public.notification_log from authenticated;

grant select on table public.notification_log to authenticated;

drop policy if exists notification_log_admin_read on public.notification_log;
create policy notification_log_admin_read
on public.notification_log
for select
to authenticated
using (public.current_user_is_admin());

-- service_role(Edge Function 전용 키)은 RLS를 우회하므로 별도 insert 정책이 필요 없습니다.
