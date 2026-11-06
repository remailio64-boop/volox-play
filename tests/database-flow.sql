-- Disposable session-local helper. The inner exception rolls back every fixture.
create or replace function pg_temp.volox_flow_test() returns jsonb
language plpgsql security invoker as $$
declare
 t uuid; c uuid; r uuid; owner_id uuid; blocked boolean; n integer;
 checks jsonb:='[]'; snapshot jsonb;
begin
 begin
  select organizer_id into owner_id from public.tournaments limit 1;
  assert owner_id is not null,'Test needs an existing organizer';
  insert into public.tournaments(organizer_id,name,slug,modality,category,fee_cents,status,payment_instructions)
   values(owner_id,'Teste transacional — não persistir',gen_random_uuid()::text,'areia_2x2','Duplas',4000,'open','TESTE: sem cobrança real') returning id into t;
  insert into public.tournament_categories(tournament_id,name,modality,fee_cents,capacity)
   values(t,'Duplas','areia_2x2',4000,2) returning id into c;
  set local role anon;
  select count(*) into n from public.tournaments where id=t;
  assert n=1,'Published tournament must be visible';
  r:=public.register_team_by_category(t,c,'Equipe QA','Responsável QA','qa@example.com','00000000000',array['Atleta QA A','Atleta QA B']);
  snapshot:=public.get_registration_status(r);
  assert snapshot->>'payment_status'='awaiting_provider','Paid entry must await payment';
  assert snapshot->>'fee_cents'='4000','Entry fee must match category';
  assert snapshot->>'payment_instructions'='TESTE: sem cobrança real','Instructions must be available';
  blocked:=false;
  begin
   select count(*) into n from public.registrations where id=r;
   blocked:=n=0;
  exception when insufficient_privilege then blocked:=true; end;
  assert blocked,'Anonymous contact data must be inaccessible';
  checks:=checks||jsonb_build_array('public registration','private contacts protected','amount and instructions');
  reset role;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  set local role authenticated;
  update public.registrations set payment_status='paid' where id=r;
  get diagnostics n=row_count;
  assert n=0,'Other organizers must not confirm payment';
  checks:=checks||jsonb_build_array('other organizer blocked');
  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  blocked:=false;
  begin
   update public.registrations set status='approved' where id=r;
  exception when others then blocked:=sqlerrm='Pagamento não confirmado'; end;
  assert blocked,'Approval before payment must fail';
  update public.registrations set payment_status='paid' where id=r;
  select count(*) into n from public.registrations where id=r and payment_confirmed_at is not null and payment_confirmed_by=owner_id;
  assert n=1,'Confirmation must record actor and server timestamp';
  blocked:=false;
  begin
   update public.registrations set payment_confirmed_at=now()+interval '1 day' where id=r;
  exception when insufficient_privilege then blocked:=true; when others then blocked:=sqlerrm='O registro de confirmação não pode ser alterado'; end;
  assert blocked,'Confirmation metadata must be immutable';
  update public.registrations set status='approved' where id=r;
  snapshot:=public.get_registration_status(r);
  assert snapshot->>'status'='approved' and snapshot->>'payment_status'='paid','Approved paid entry must be trackable';
  checks:=checks||jsonb_build_array('unpaid approval blocked','manual confirmation audited','audit tampering blocked','approval and tracking');
  reset role;
  perform public.register_team_by_category(t,c,'Equipe QA 2','Responsável QA','qa2@example.com','00000000000',array['Atleta QA C','Atleta QA D']);
  blocked:=false;
  begin
   perform public.register_team_by_category(t,c,'Equipe QA 3','Responsável QA','qa3@example.com','00000000000',array['Atleta QA E','Atleta QA F']);
  exception when others then blocked:=sqlerrm='Vagas esgotadas nesta categoria'; end;
  assert blocked,'Capacity must not be exceeded';
  checks:=checks||jsonb_build_array('capacity limit');
  update public.tournaments set status='draft' where id=t;
  set local role anon;
  select count(*) into n from public.tournaments where id=t;
  assert n=0,'Draft must disappear from public list';
  blocked:=false;
  begin
   perform public.register_team_by_category(t,c,'Equipe QA 4','Responsável QA','qa4@example.com','00000000000',array['Atleta QA G','Atleta QA H']);
  exception when others then blocked:=sqlerrm='Campeonato indisponivel'; end;
  assert blocked,'Draft registrations must be blocked';
  checks:=checks||jsonb_build_array('draft hidden','draft registration blocked');
  raise exception using errcode='Z0001',message='Rollback fixtures';
 exception
  when sqlstate 'Z0001' then return jsonb_build_object('passed',true,'fixtures_rolled_back',true,'checks',checks);
  when others then return jsonb_build_object('passed',false,'fixtures_rolled_back',true,'error',sqlerrm,'checks',checks);
 end;
end;
$$;
select pg_temp.volox_flow_test();
