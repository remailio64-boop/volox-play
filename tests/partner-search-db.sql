-- All fixture users, profiles and invitations are rolled back.
create or replace function pg_temp.test_partner_search(p_setup text default '') returns jsonb
language plpgsql as $test$
declare viewer uuid:=gen_random_uuid(); partner uuid:=gen_random_uuid(); hidden uuid:=gen_random_uuid();
 prefix text:='QA'||substr(replace(gen_random_uuid()::text,'-',''),1,8); code text; own_code text;
 tid uuid; cid uuid; rid uuid; owner_id uuid; rows jsonb; blocked boolean; i integer;
begin
 begin
  if p_setup<>'' then execute p_setup; end if;
  insert into auth.users(id,email) values(viewer,viewer::text||'@example.com'),(partner,partner::text||'@example.com'),(hidden,hidden::text||'@example.com');
  insert into public.athlete_profiles(id,display_name,city,is_public,allow_partner_search) values
   (viewer,prefix||' João','Assis',false,false),
   (partner,prefix||' João','Cândido Mota',false,true),
   (hidden,prefix||' João','Cândido Mota',false,false);
  select public_code into own_code from public.athlete_profiles where id=viewer;
  select public_code into code from public.athlete_profiles where id=partner;
  perform set_config('request.jwt.claim.sub',viewer::text,true);
  set local role authenticated;
  rows:=public.search_athlete_partners(prefix||' joao','candido');
  assert jsonb_array_length(rows)=1,'Accent-insensitive name/city search must find consenting private partner only';
  assert rows->0->>'public_code'=code,'Search must return exact identity used by invitations';
  assert (select count(*) from jsonb_object_keys(rows->0))=3,'Only code, name and city may be returned';
  assert public.search_athlete_partners('QA','')='[]','Short query must not enumerate profiles';
  assert public.search_athlete_partners(prefix||'%','')='[]','Wildcards must be treated literally';
  assert public.search_athlete_partners(prefix,'Other City')='[]','City filter must apply';
  assert jsonb_array_length(public.search_athlete_partners(prefix))=1,'Caller and hidden profiles must not appear';
  reset role;
  assert not has_function_privilege('anon','public.search_athlete_partners(text,text)','execute'),'Anonymous search must be denied';
  assert not has_function_privilege('anon','volox_private.search_athlete_partners(text,text)','execute'),'Private helper must not be anonymous';
  assert not has_function_privilege('authenticated','volox_private.partner_search_text(text)','execute'),'Normalization helper must stay private';
  -- Discovery does not make private profiles readable through the table API.
  set local role authenticated;
  assert not exists(select 1 from public.athlete_profiles where id=partner),'Private searchable profile must keep table RLS';
  reset role;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  set local role authenticated;
  update public.athlete_profiles set allow_partner_search=false where id=partner;
  reset role;
  perform set_config('request.jwt.claim.sub',viewer::text,true);
  set local role authenticated;
  assert public.search_athlete_partners(prefix)='[]','Revoking search consent must take effect immediately';
  reset role;
  update public.athlete_profiles set is_public=true where id=partner;
  set local role authenticated;
  assert jsonb_array_length(public.search_athlete_partners(prefix))=1,'Already public profiles remain discoverable';
  reset role;
  for i in 1..15 loop
   insert into auth.users(id,email) values(gen_random_uuid(),prefix||i||'@example.com') returning id into owner_id;
   insert into public.athlete_profiles(id,display_name,is_public) values(owner_id,prefix||' Homônimo '||i,true);
  end loop;
  set local role authenticated;
  assert jsonb_array_length(public.search_athlete_partners(prefix))=12,'Results must be bounded';
  reset role;
  select organizer_id into owner_id from public.tournaments limit 1;
  insert into public.tournaments(organizer_id,name,slug,modality,category,fee_cents,status)
   values(owner_id,prefix||' test',gen_random_uuid()::text,'areia_2x2','Livre',0,'open') returning id into tid;
  insert into public.tournament_categories(tournament_id,name,modality,fee_cents,registration_mode)
   values(tid,'Livre','areia_2x2',0,'formed') returning id into cid;
  set local role authenticated;
  rid:=public.register_athlete_team(tid,cid,'Dupla QA',viewer::text||'@example.com','00000000000',array[own_code,code]);
  reset role;
  assert exists(select 1 from public.registration_athletes where registration_id=rid and athlete_id=viewer and status='confirmed'),'Captain confirmed automatically';
  assert exists(select 1 from public.registration_athletes where registration_id=rid and athlete_id=partner and status='pending'),'Selecting a search result must still require partner confirmation';
  perform set_config('request.jwt.claim.sub',hidden::text,true);
  set local role authenticated;
  blocked:=false;
  begin perform public.respond_athlete_invite(rid,true); exception when others then blocked:=true; end;
  assert blocked,'A different athlete cannot accept another invite';
  reset role;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  set local role authenticated;
  perform public.respond_athlete_invite(rid,true);
  reset role;
  assert exists(select 1 from public.registration_athletes where registration_id=rid and athlete_id=partner and status='confirmed'),'Selected partner can accept invite';
  raise exception using errcode='ZX001',message='rollback QA fixtures';
 exception when sqlstate 'ZX001' then null;
 end;
 assert not exists(select 1 from public.athlete_profiles where display_name like prefix||'%'),'Fixture rollback must be complete';
 return jsonb_build_object('passed',true,'fixtures_rolled_back',true,'checks','privacy, accents, cities, literal matching, bounded results, consent revocation, RLS, invitations');
end;
$test$;
