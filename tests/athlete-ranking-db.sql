-- p_setup optionally installs the migration INSIDE the rolled-back test block.
-- No users, profiles, tournaments or points from this test are retained.
create or replace function pg_temp.test_athlete_rankings(p_setup text default '') returns jsonb
language plpgsql security invoker as $test$
declare owner_id uuid; tid uuid; cid uuid; drawn_cid uuid; rid uuid; i integer; n integer;
 user_ids uuid[]:='{}'; codes text[]:='{}'; regs uuid[]:='{}'; code text; uid uuid;
 m record; blocked boolean; result jsonb; history jsonb; checks jsonb:='[]'; total integer;
begin
 begin
  if p_setup<>'' then execute p_setup; end if;
  select organizer_id into owner_id from public.tournaments limit 1;
  assert owner_id is not null,'Existing organizer needed';
  insert into public.tournaments(organizer_id,name,slug,modality,category,fee_cents,status)
   values(owner_id,'QA ranking — rollback',gen_random_uuid()::text,'areia_2x2','Duplas',0,'open') returning id into tid;
  insert into public.tournament_categories(tournament_id,name,modality,capacity,registration_mode)
   values(tid,'Dupla Masculina QA','areia_2x2',16,'formed') returning id into cid;
  for i in 1..16 loop
   uid:=gen_random_uuid(); user_ids:=array_append(user_ids,uid);
   insert into auth.users(id,email) values(uid,'qa-'||uid::text||'@example.com');
   perform set_config('request.jwt.claim.sub',uid::text,true);
   set local role authenticated;
   insert into public.athlete_profiles(display_name,city,is_public)
    values('Atleta QA '||i,'Cidade QA',i<>16) returning public_code into code;
   codes:=array_append(codes,code);
   reset role;
  end loop;
  checks:=checks||jsonb_build_array('own profile creation with RLS');
  for i in 1..8 loop
   perform set_config('request.jwt.claim.sub',user_ids[2*i-1]::text,true);
   set local role authenticated;
   rid:=public.register_athlete_team(tid,cid,'Dupla QA '||i,'qa@example.com','00000000000',codes[2*i-1:2*i]);
   regs:=array_append(regs,rid);
   if i=1 then
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    blocked:=false;
    begin update public.registrations set status='approved' where id=rid;
    exception when others then blocked:=sqlerrm like '%confirmar o vínculo%'; end;
    assert blocked,'Unconfirmed roster must block approval';
    perform set_config('request.jwt.claim.sub',user_ids[1]::text,true);
    checks:=checks||jsonb_build_array('unconfirmed roster blocks approval');
    blocked:=false;
    begin perform public.register_athlete_team(tid,cid,'Repetida QA','qa@example.com','00000000000',codes[1:2]);
    exception when others then blocked:=sqlerrm like '%já possui inscrição%'; end;
    assert blocked,'Duplicate athlete entry must fail';
    perform set_config('request.jwt.claim.sub',user_ids[3]::text,true);
    blocked:=false;
    begin perform public.respond_athlete_invite(rid,true);
    exception when others then blocked:=sqlerrm like '%Convite indisponível%'; end;
    assert blocked,'Other athlete must not accept invitation';
    select count(*) into n from public.registrations where id=rid;
    assert n=0,'Unrelated athlete must not see contact data';
    perform set_config('request.jwt.claim.sub',user_ids[2]::text,true);
    history:=public.get_athlete_dashboard();
    assert history->'participations'->0->>'membership_status'='pending','Invite must appear in partner account';
   end if;
   perform set_config('request.jwt.claim.sub',user_ids[2*i]::text,true);
   perform public.respond_athlete_invite(rid,true);
   reset role;
  end loop;
  checks:=checks||jsonb_build_array('team registration linked to stable accounts','duplicate enrollment blocked','invitation ownership','invitation visible across devices','contact privacy');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  update public.registrations set status='approved' where tournament_id=tid;
  perform public.sortear_chaves(cid);
  reset role;
  for m in select * from public.draw_matches where category_id=cid loop
   set local role authenticated;
   perform public.volox_salvar_placar(m.id,case when array_position(regs,m.team_a_id)<array_position(regs,m.team_b_id)
    then '[[21,10],[21,10]]'::jsonb else '[[10,21],[10,21]]'::jsonb end);
   reset role;
  end loop;
  set local role authenticated;
  perform public.volox_gerar_semifinais(cid);
  reset role;
  for m in select * from public.volox_knockout_matches where category_id=cid and phase in ('semi1','semi2') loop
   set local role authenticated;
   perform public.volox_salvar_eliminatoria(m.id,case when array_position(regs,m.team_a_id)<array_position(regs,m.team_b_id)
    then '[[21,10],[21,10]]'::jsonb else '[[10,21],[10,21]]'::jsonb end);
   reset role;
  end loop;
  set local role authenticated;
  perform public.volox_gerar_finais(cid);
  reset role;
  for m in select * from public.volox_knockout_matches where category_id=cid and phase in ('final','third') loop
   set local role authenticated;
   perform public.volox_salvar_eliminatoria(m.id,case when array_position(regs,m.team_a_id)<array_position(regs,m.team_b_id)
    then '[[21,10],[21,10]]'::jsonb else '[[10,21],[10,21]]'::jsonb end);
   reset role;
  end loop;
  set local role authenticated;
  perform public.confirm_athlete_ranking(cid);
  perform public.volox_definir_publicacao(cid,true);
  perform public.confirm_athlete_ranking(cid);
  set local role anon;
  result:=public.get_athlete_rankings();
  assert jsonb_array_length(result)=15,'Only opted-in athletes may appear';
  select sum((x->>'points')::integer) into total from jsonb_array_elements(result) x;
  assert total=570,'Expected placement points, without duplicate awards';
  assert public.get_athlete_public_profile(codes[16]) is null,'Opted-out public profile must be unavailable';
  blocked:=false;
  begin perform public.get_athlete_dashboard(); exception when insufficient_privilege then blocked:=true; end;
  assert blocked,'Anonymous access to private dashboard must fail';
  reset role;
  select count(*) into n from volox_private.athlete_result_entries where category_id=cid;
  assert n=16,'All team members must have individual points';
  checks:=checks||jsonb_build_array('group games and knockout flow','per-athlete placement points','idempotent confirmation','public opt-in respected','private dashboard protected');
  perform set_config('request.jwt.claim.sub',user_ids[16]::text,true);
  set local role authenticated;
  history:=public.get_athlete_dashboard();
  assert history->'participations'->0->>'points'='10','Opted-out athlete retains points privately';
  blocked:=false;
  begin perform public.confirm_athlete_ranking(cid);
  exception when others then blocked:=sqlerrm like '%acesso negado%'; end;
  assert blocked,'Only event owner may confirm points';
  update public.athlete_profiles set display_name='Intruso' where id=user_ids[1];
  get diagnostics n=row_count;
  assert n=0,'Another profile must not be editable';
  blocked:=false;
  begin update public.athlete_profiles set public_code='0123456789ab' where id=user_ids[16];
  exception when insufficient_privilege then blocked:=true; end;
  assert blocked,'Stable athlete code must not be editable';
  reset role;
  checks:=checks||jsonb_build_array('private history survives public opt-out','ranking publication ownership','profile ownership','immutable identity code');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select * into m from public.volox_knockout_matches where category_id=cid and phase='final';
  set local role authenticated;
  perform public.volox_salvar_eliminatoria(m.id,case when m.sets_a>m.sets_b then '[[21,11],[21,11]]'::jsonb else '[[11,21],[11,21]]'::jsonb end);
  set local role anon;
  assert jsonb_array_length(public.get_athlete_rankings())=0,'Score changes must suspend points';
  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  perform public.confirm_athlete_ranking(cid);
  set local role anon;
  assert jsonb_array_length(public.get_athlete_rankings())=15,'Reconfirmation restores points once';
  reset role;
  checks:=checks||jsonb_build_array('score correction suspends ranking','reconfirmation restores points');
  insert into public.tournament_categories(tournament_id,name,modality,capacity,registration_mode)
   values(tid,'Quarteto sorteado QA','areia_4x4',16,'drawn') returning id into drawn_cid;
  perform set_config('request.jwt.claim.sub',user_ids[1]::text,true);
  set local role authenticated;
  rid:=public.register_athlete_team(tid,drawn_cid,'Individual QA','outro-qa@example.com','00000000000',codes[1:1]);
  history:=public.get_athlete_dashboard();
  assert jsonb_array_length(history->'participations')=2,'Individual drawn entry must be saved to account';
  reset role;
  checks:=checks||jsonb_build_array('individual drawn registration preserved');
  raise exception using errcode='Z0001',message='Rollback all athlete fixtures';
 exception
  when sqlstate 'Z0001' then return jsonb_build_object('passed',true,'fixtures_rolled_back',true,'checks',checks);
  when assert_failure then return jsonb_build_object('passed',false,'fixtures_rolled_back',true,'error',sqlerrm,'checks',checks);
  when others then return jsonb_build_object('passed',false,'fixtures_rolled_back',true,'error',sqlerrm,'checks',checks);
 end;
end;
$test$;
