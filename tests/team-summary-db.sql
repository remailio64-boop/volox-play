-- Runs fixture users/invitations in a subtransaction, then rolls everything back.
create or replace function pg_temp.test_team_summary(p_setup text default '') returns jsonb
language plpgsql as $test$
declare captain uuid:=gen_random_uuid(); partner uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 owner_id uuid; tid uuid; cid uuid; rid uuid; codes text[]; row jsonb; uid uuid; i integer:=0;
begin
 begin
  if p_setup<>'' then execute p_setup; end if;
  foreach uid in array array[captain,partner,outsider] loop
   i:=i+1;
   insert into auth.users(id,email) values(uid,uid::text||'@example.com');
   insert into public.athlete_profiles(id,display_name,is_public) values(uid,'Resumo privado QA '||i,false);
  end loop;
  select organizer_id into owner_id from public.tournaments limit 1;
  insert into public.tournaments(organizer_id,name,slug,modality,category,fee_cents,status)
   values(owner_id,'Resumo QA',gen_random_uuid()::text,'areia_2x2','Livre',4000,'open') returning id into tid;
  insert into public.tournament_categories(tournament_id,name,modality,fee_cents,registration_mode)
   values(tid,'Livre','areia_2x2',4000,'formed') returning id into cid;
  select array_agg(public_code order by case when id=captain then 0 else 1 end) into codes
   from public.athlete_profiles where id in(captain,partner);
  perform set_config('request.jwt.claim.sub',captain::text,true);
  set local role authenticated;
  rid:=public.register_athlete_team(tid,cid,'Dupla resumo QA','private@example.com','00000000000',codes);
  row:=public.get_team_registration_summary(rid);
  assert row->>'team_name'='Dupla resumo QA','Captain must see summary';
  assert jsonb_array_length(row->'members')=2,'Both teammates must appear';
  assert row->'members'->0->>'status'='confirmed','Captain confirmed';
  assert row->'members'->1->>'status'='pending','Partner pending';
  assert (row->'members'->0->>'is_me')::boolean,'Current athlete identified without exposing account ID';
  assert (select count(*) from jsonb_object_keys(row->'members'->0))=3,'Roster DTO must not leak identifiers or contact data';
  assert not row::text like '%private@example.com%' and not row::text like '%00000000000%','Contacts stay private';
  assert row->>'payment_status'<>'paid','Pending payment must not be shown as confirmed';
  reset role;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  set local role authenticated;
  row:=public.get_team_registration_summary(rid);
  assert row->'members'->0->>'name'='Resumo privado QA 1','Invited partner can see own team even with private profiles';
  assert (row->'members'->1->>'is_me')::boolean,'Partner identity correct';
  assert exists(select 1 from jsonb_array_elements(public.get_athlete_dashboard()->'participations') p
   where p->>'registration_id'=rid::text and p->>'membership_status'='pending'),'Pending invite must appear in own dashboard';
  perform public.respond_athlete_invite(rid,true);
  row:=public.get_team_registration_summary(rid);
  assert row->'members'->1->>'status'='confirmed','Acceptance must update summary';
  reset role;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  set local role authenticated;
  assert public.get_team_registration_summary(rid) is null,'Unrelated athlete must not read roster by guessing ID';
  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  assert public.get_team_registration_summary(rid) is not null,'Organizer can inspect team';
  update public.registrations set payment_status='paid' where id=rid;
  assert public.get_team_registration_summary(rid)->>'payment_status'='paid','Manual receipt reflected in summary';
  update public.registrations set status='rejected' where id=rid;
  assert public.get_team_registration_summary(rid)->>'status'='rejected','Rejected state preserved';
  reset role;
  assert not has_function_privilege('anon','public.get_team_registration_summary(uuid)','execute'),'No anonymous summary access';
  assert not has_function_privilege('anon','volox_private.team_registration_summary(uuid)','execute'),'No anonymous helper access';
  perform set_config('request.jwt.claim.sub','',true);
  assert volox_private.team_registration_summary(rid) is null,'Helper must reject absent identity';
  raise exception using errcode='ZX002',message='rollback summary fixtures';
 exception when sqlstate 'ZX002' then null;
 end;
 assert not exists(select 1 from auth.users where id in(captain,partner,outsider)),'No fixture accounts persist';
 return jsonb_build_object('passed',true,'fixtures_rolled_back',true,'checks','captain, teammate, organizer, outsider and anonymous access; private roster DTO; invitation acceptance; payment and rejection states');
end;
$test$;
