create or replace function pg_temp.test_free_organizer_activation(p_setup text default '') returns jsonb
language plpgsql as $test$
declare uid uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); email text; tid uuid; i integer;
begin
 email:='qa-free-'||uid::text||'@example.com';
 begin
  if p_setup<>'' then execute p_setup; end if;
  insert into volox_private.approved_organizer_emails(email) values(email);
  insert into auth.users(id,email) values(uid,email);
  assert not exists(select 1 from public.platform_free_organizers where organizer_id=uid),'Unconfirmed account not activated';
  update auth.users set email_confirmed_at=now() where id=uid;
  assert exists(select 1 from public.platform_free_organizers where organizer_id=uid),'Approved confirmed email activates unlimited account';
  insert into auth.users(id,email,email_confirmed_at) values(other_id,other_id::text||'@example.com',now());
  assert not exists(select 1 from public.platform_free_organizers where organizer_id=other_id),'Other accounts never inherit exception';
  perform set_config('request.jwt.claim.sub',uid::text,true);
  set local role authenticated;
  assert public.is_free_organizer(),'Existing commercial gate recognizes free account';
  reset role;
  for i in 1..3 loop
   insert into public.tournaments(organizer_id,name,slug,modality,category,fee_cents,status)
    values(uid,'Free QA '||i,gen_random_uuid()::text,'areia_2x2','Livre',0,'draft') returning id into tid;
   insert into public.organizer_trial_publications(tournament_id,organizer_id) values(tid,uid);
  end loop;
  set local role authenticated;
  tid:=public.create_trial_tournament('Quarto torneio QA','[{"name":"Livre","modality":"areia_2x2","fee_cents":0,"capacity":16}]'::jsonb);
  assert tid is not null,'Approved organizer may create beyond three trial publications';
  reset role;
  assert not has_table_privilege('authenticated','volox_private.approved_organizer_emails','insert'),'Clients cannot grant their own exemption';
  assert not has_table_privilege('anon','volox_private.approved_organizer_emails','select'),'Allowlist stays private';
  assert not has_function_privilege('authenticated','volox_private.activate_free_organizer_account()','execute'),'Clients cannot execute activation helper';
  raise exception using errcode='ZX003',message='rollback free organizer fixtures';
 exception when sqlstate 'ZX003' then null;
 end;
 assert not exists(select 1 from auth.users where id in(uid,other_id)),'No test accounts persist';
 return jsonb_build_object('passed',true,'fixtures_rolled_back',true,'checks','deferred signup activation, confirmation guard, no unrelated grants, existing unlimited gate, beyond trial allowance, private permissions');
end;
$test$;
