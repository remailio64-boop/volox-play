-- Installs optional p_setup within a subtransaction and rolls back ALL fixtures.
create or replace function pg_temp.test_drawn_competitions(p_setup text default '') returns jsonb
language plpgsql security invoker as $test$
declare owner_id uuid; tid uuid; cid uuid; uid uuid; code text; rid uuid; extra_id uuid;
 mode text; size integer; nplayers integer; i integer; n integer; expected_total integer;
 users uuid[]; codes text[]; sources uuid[]; teams uuid[]; blocked boolean; own_team uuid;
 m record; result jsonb; history jsonb; points integer; checks jsonb:='[]';
begin
 begin
  if p_setup<>'' then execute p_setup; end if;
  select organizer_id into owner_id from public.tournaments limit 1;
  for mode,size in select * from (values('areia_2x2',2),('areia_4x4',4),('beach_tennis_duplas',2)) v(modality,team_size) loop
   users:='{}';codes:='{}';sources:='{}';teams:='{}';nplayers:=size*4;
   insert into public.tournaments(organizer_id,name,slug,modality,category,fee_cents,status)
    values(owner_id,'QA sorteadas — rollback',gen_random_uuid()::text,mode,'Sorteada QA',4000,'open') returning id into tid;
   insert into public.tournament_categories(tournament_id,name,modality,fee_cents,capacity,registration_mode,best_of)
    values(tid,'Sorteada QA '||mode,mode,4000,size*6,'drawn',case when mode='beach_tennis_duplas' then 1 else 3 end) returning id into cid;
   for i in 1..nplayers+2 loop
    uid:=gen_random_uuid();users:=array_append(users,uid);
    insert into auth.users(id,email) values(uid,'qa-draw-'||uid::text||'@example.com');
    perform set_config('request.jwt.claim.sub',uid::text,true);
    set local role authenticated;
    insert into public.athlete_profiles(display_name,is_public) values('Atleta sorteado QA '||i,i<>1) returning public_code into code;
    codes:=array_append(codes,code);
    if i<=nplayers+1 then
     rid:=public.register_athlete_team(tid,cid,'Individual QA','qa-'||uid::text||'@example.com','00000000000',array[code]);
     sources:=array_append(sources,rid);
    end if;
    reset role;
   end loop;
   perform set_config('request.jwt.claim.sub',owner_id::text,true);
   set local role authenticated;
   update public.registrations set payment_status='paid' where id=any(sources);
   update public.registrations set status='approved' where id=any(sources[1:nplayers-1]);
   blocked:=false;
   begin perform public.draw_category_teams(cid); exception when others then blocked:=true; end;
   assert blocked,'Incomplete approved roster must not be silently truncated';
   update public.registrations set status='approved' where id=sources[nplayers];
   -- First approve the extra athlete to exercise the non-multiple guard.
   update public.registrations set status='approved' where id=sources[nplayers+1];
   blocked:=false;
   begin perform public.draw_category_teams(cid); exception when others then blocked:=sqlerrm like '%não formam equipes completas%'; end;
   assert blocked,'Non-multiple count must be rejected';
   update public.registrations set status='pending' where id=sources[nplayers+1];
   perform set_config('request.jwt.claim.sub',users[1]::text,true);
   blocked:=false;
   begin perform public.draw_category_teams(cid); exception when others then blocked:=sqlerrm like '%acesso negado%'; end;
   assert blocked,'Other athlete must not draw teams';
   perform set_config('request.jwt.claim.sub',owner_id::text,true);
   assert public.draw_category_teams(cid)=4,'Must form exactly four teams';
   reset role;
   select array_agg(team_registration_id order by team_number) into teams from public.drawn_teams where category_id=cid;
   select count(distinct r) into n from public.drawn_teams dt cross join lateral unnest(dt.member_registration_ids) r where dt.category_id=cid;
   assert n=nplayers,'Every approved participant must appear once';
   assert (select bool_and(cardinality(member_registration_ids)=size) from public.drawn_teams where category_id=cid),'Teams must have exact size';
   assert not exists(select 1 from public.drawn_teams dt where dt.category_id=cid and sources[nplayers+1]=any(dt.member_registration_ids)),'Pending extra entry must remain outside the draw';
   assert (select count(*) from public.registrations where category_id=cid and entry_kind='drawn_team' and payment_status='not_required')=4,'Generated teams must not create additional payment obligations';
   assert (select count(*) from public.registrations where category_id=cid and entry_kind='individual' and payment_status='paid')=nplayers+1,'Individual payment records must remain unchanged';
   assert (select registrations_closed and status='open' from public.tournament_categories where id=cid),'Entries close while the category remains visible for results';
   set local role authenticated;
   blocked:=false;
   begin perform public.draw_category_teams(cid); exception when others then blocked:=true; end;
   assert blocked,'A committed draw must not be repeated';
   blocked:=false;
   begin update public.registrations set status='rejected' where id=sources[1]; exception when others then blocked:=sqlerrm like '%sorteio já%'; end;
   assert blocked,'Participants may not be removed after the draw';
   blocked:=false;
   begin update public.registrations set status='approved' where id=sources[nplayers+1]; exception when others then blocked:=sqlerrm like '%sorteio já%'; end;
   assert blocked,'A pending extra athlete may not be added after the draw';
   update public.registrations set status='rejected' where id=sources[nplayers+1];
   perform set_config('request.jwt.claim.sub',users[nplayers+2]::text,true);
   blocked:=false;
   begin perform public.register_athlete_team(tid,cid,'Tardia QA','qa-late-'||users[nplayers+2]::text||'@example.com','00000000000',array[codes[nplayers+2]]);
   exception when others then blocked:=true; end;
   assert blocked,'Late registration must be rejected';
   set local role anon;
   result:=public.get_drawn_teams(cid);
   assert jsonb_array_length(result)=4,'Published teams must be available publicly';
   assert not result::text like '%Atleta sorteado QA 1"%','A private athlete name must not be exposed publicly';
   assert not result::text like '%@example.com%' and not result::text like '%00000000000%','Contacts must not be exposed in team lists';
   reset role;
   select team_registration_id into own_team from public.drawn_teams where category_id=cid and sources[1]=any(member_registration_ids);
   select ra.athlete_id into uid from public.registration_athletes ra where ra.registration_id=own_team and ra.athlete_id<>users[1] limit 1;
   perform set_config('request.jwt.claim.sub',uid::text,true);
   set local role authenticated;
   result:=public.get_drawn_teams(cid);
   assert result::text like '%Atleta sorteado QA 1"%','Teammates must see their own team composition';
   perform set_config('request.jwt.claim.sub',owner_id::text,true);
   perform public.sortear_chaves(cid);
   reset role;
   assert (select count(*) from public.draw_groups where category_id=cid)=2,'Four teams must form two valid groups';
   assert (select count(*) from public.draw_group_teams where category_id=cid)=4,'Only generated teams must enter the groups';
   for m in select * from public.draw_matches where category_id=cid loop
    set local role authenticated;
    perform public.volox_salvar_placar(m.id,case when mode='beach_tennis_duplas' then '[[6,2]]'::jsonb else '[[21,10],[21,10]]'::jsonb end);
    reset role;
   end loop;
   set local role authenticated;
   perform public.volox_gerar_semifinais(cid);
   reset role;
   for m in select * from public.volox_knockout_matches where category_id=cid and phase in ('semi1','semi2') loop
    set local role authenticated;
    perform public.volox_salvar_eliminatoria(m.id,case when mode='beach_tennis_duplas' then '[[6,2]]'::jsonb else '[[21,10],[21,10]]'::jsonb end);
    reset role;
   end loop;
   set local role authenticated;
   perform public.volox_gerar_finais(cid);
   reset role;
   for m in select * from public.volox_knockout_matches where category_id=cid and phase in ('final','third') loop
    set local role authenticated;
    perform public.volox_salvar_eliminatoria(m.id,case when mode='beach_tennis_duplas' then '[[6,2]]'::jsonb else '[[21,10],[21,10]]'::jsonb end);
    reset role;
   end loop;
   set local role authenticated;
   perform public.confirm_athlete_ranking(cid);
   perform public.confirm_athlete_ranking(cid);
   perform public.volox_definir_publicacao(cid,true);
   reset role;
   select count(*),sum(e.points) into n,points from volox_private.athlete_result_entries e where e.category_id=cid;
   assert n=nplayers,'Each individual must receive one ranking entry';
   assert points=size*250,'Placement points must be attributed to each team member without duplicates';
   perform set_config('request.jwt.claim.sub',users[1]::text,true);
   set local role authenticated;
   history:=public.get_athlete_dashboard();
   assert jsonb_array_length(history->'participations')=1,'Account history must not duplicate individual and generated team entries';
   assert (history->'participations'->0->>'points')::integer in (100,70,50,30),'Individual history must carry team placement points';
   assert history->'participations'->0->>'registration_id'=sources[1]::text,'Private tracking must retain the original payment entry';
   assert history->'participations'->0->>'team_name' like 'Equipe sorteada %','The assigned team must appear in the athlete account';
   reset role;
   checks:=checks||jsonb_build_array(mode||': formation, payment separation, closed entries, ownership, privacy, games, individual ranking and single history');
  end loop;
  -- Nine pre-formed teams must also complete the two-group qualification path.
  insert into public.tournaments(organizer_id,name,slug,modality,category,fee_cents,status)
   values(owner_id,'QA nove duplas — rollback',gen_random_uuid()::text,'areia_2x2','Formadas QA',0,'open') returning id into tid;
  insert into public.tournament_categories(tournament_id,name,modality,capacity,registration_mode)
   values(tid,'Nove formadas QA','areia_2x2',16,'formed') returning id into cid;
  teams:='{}';
  for i in 1..9 loop
   rid:=public.register_team_by_category(tid,cid,'Equipe QA '||i,'Responsável QA','qa-nine-'||i||'@example.com','00000000000',array['Atleta QA '||i||' A','Atleta QA '||i||' B']);
   teams:=array_append(teams,rid);
  end loop;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  update public.registrations set status='approved' where category_id=cid;
  perform public.sortear_chaves(cid);
  reset role;
  assert (select count(*) from public.draw_groups where category_id=cid)=2,'Nine teams must produce two balanced groups';
  assert (select count(*) from public.draw_matches where category_id=cid)=16,'Nine teams must have all 16 group games';
  for m in select * from public.draw_matches where category_id=cid loop
   set local role authenticated;
   perform public.volox_salvar_placar(m.id,case when array_position(teams,m.team_a_id)<array_position(teams,m.team_b_id)
    then '[[21,10],[21,10]]'::jsonb else '[[10,21],[10,21]]'::jsonb end);
   reset role;
  end loop;
  set local role authenticated;
  perform public.volox_gerar_semifinais(cid);
  reset role;
  assert (select count(*) from public.volox_knockout_matches where category_id=cid and phase in ('semi1','semi2'))=2,'Nine teams must advance to two semifinals';
  checks:=checks||jsonb_build_array('nine formed teams: balanced groups and semifinals');
  raise exception using errcode='Z0001',message='Rollback all drawn competition fixtures';
 exception
  when sqlstate 'Z0001' then return jsonb_build_object('passed',true,'fixtures_rolled_back',true,'checks',checks);
  when assert_failure then return jsonb_build_object('passed',false,'fixtures_rolled_back',true,'error',sqlerrm,'checks',checks);
  when others then return jsonb_build_object('passed',false,'fixtures_rolled_back',true,'error',sqlerrm,'checks',checks);
 end;
end;
$test$;
