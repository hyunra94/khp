create or replace function certificate_private.correct_resident_number(p_trainee_id uuid, p_number text)
returns void language plpgsql security definer set search_path='' as $$
declare digits text; secret text; birth_year integer;
begin
  if auth.uid() is null or not public.current_user_is_admin() then raise exception 'not authorized'; end if;
  digits := regexp_replace(coalesce(p_number,''),'[^0-9]','','g');
  if length(digits) <> 13 then raise exception '주민등록번호 13자리를 확인해주세요'; end if;
  birth_year := substring(digits,1,2)::integer + case substring(digits,7,1)
    when '1' then 1900 when '2' then 1900 when '5' then 1900 when '6' then 1900
    when '3' then 2000 when '4' then 2000 when '7' then 2000 when '8' then 2000 else 1800 end;
  begin
    perform make_date(birth_year,substring(digits,3,2)::integer,substring(digits,5,2)::integer);
  exception when datetime_field_overflow then raise exception '생년월일 부분을 확인해주세요'; end;
  select decrypted_secret into secret from vault.decrypted_secrets where name='trainee_rrn_key';
  if secret is null then raise exception '암호화 설정을 확인해주세요'; end if;
  update public.trainees set resident_number_enc=extensions.pgp_sym_encrypt(digits,secret),
    resident_number_hash=encode(extensions.hmac(digits,secret,'sha256'),'hex'), birth6=substring(digits,1,6)
    where id=p_trainee_id;
  if not found then raise exception '신청자를 찾지 못했습니다'; end if;
exception when unique_violation then raise exception '다른 신청자에게 등록된 번호입니다. 신청자 정보를 확인해주세요';
end $$;
revoke all on function certificate_private.correct_resident_number(uuid,text) from public,anon;
grant execute on function certificate_private.correct_resident_number(uuid,text) to authenticated;
create or replace function public.admin_correct_resident_number(p_trainee_id uuid,p_number text)
returns void language sql security invoker set search_path='' as $$
  select certificate_private.correct_resident_number(p_trainee_id,p_number)
$$;
revoke all on function public.admin_correct_resident_number(uuid,text) from public,anon;
grant execute on function public.admin_correct_resident_number(uuid,text) to authenticated;
