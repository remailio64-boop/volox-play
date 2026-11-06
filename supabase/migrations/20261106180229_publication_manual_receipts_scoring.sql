-- Keep payment confirmation manual, authenticated, owner-scoped and auditable.
alter table public.tournaments add column payment_instructions text not null default ''
 check (char_length(payment_instructions)<=1000);
alter table public.registrations add column payment_confirmed_at timestamptz;
alter table public.registrations add column payment_confirmed_by uuid;
alter table public.registrations add constraint registration_confirmation_pair
 check ((payment_confirmed_at is null)=(payment_confirmed_by is null));

create or replace function public.enforce_registration_transition()
returns trigger language plpgsql security invoker set search_path='' as $function$
begin
 if new.id is distinct from old.id
 or new.category_id is distinct from old.category_id
 or new.tournament_id is distinct from old.tournament_id
 or new.team_name is distinct from old.team_name
 or new.captain_name is distinct from old.captain_name
 or new.captain_email is distinct from old.captain_email
 or new.captain_phone is distinct from old.captain_phone
 or new.athletes is distinct from old.athletes
 or new.created_at is distinct from old.created_at then
  raise exception 'Os dados originais da inscrição não podem ser alterados';
 end if;
 if new.payment_status is distinct from old.payment_status then
  if new.payment_status<>'paid' or old.payment_status not in ('awaiting_provider','pending')
   or old.status='rejected' or new.status is distinct from old.status then
   raise exception 'Transição de pagamento não permitida';
  end if;
  if auth.uid() is null or not exists (
   select 1 from public.tournaments t where t.id=old.tournament_id and t.organizer_id=auth.uid()
  ) then raise exception 'Somente o organizador pode confirmar o recebimento'; end if;
  new.payment_confirmed_at:=now();
  new.payment_confirmed_by:=auth.uid();
 elsif new.payment_confirmed_at is distinct from old.payment_confirmed_at
    or new.payment_confirmed_by is distinct from old.payment_confirmed_by then
  raise exception 'O registro de confirmação não pode ser alterado';
 end if;
 if new.status='approved' and new.payment_status not in ('not_required','paid') then
  raise exception 'Pagamento não confirmado';
 end if;
 return new;
end;
$function$;

create or replace function public.get_registration_status(p_id uuid)
returns jsonb language sql security definer set search_path='' as $function$
 select jsonb_build_object('team_name',r.team_name,'status',r.status,
  'payment_status',r.payment_status,'tournament_name',t.name,
  'payment_instructions',t.payment_instructions,'fee_cents',coalesce(c.fee_cents,t.fee_cents),
  'payment_confirmed_at',r.payment_confirmed_at)
 from public.registrations r join public.tournaments t on t.id=r.tournament_id
 left join public.tournament_categories c on c.id=r.category_id where r.id=p_id;
$function$;

-- A single volleyball set uses the regular target; only a deciding set in a
-- multi-set match uses 15. An extended set must end at a two-point difference.
create or replace function public.volox_valid_set_score(
 p_modality text,p_best_of integer,p_index integer,p_a integer,p_b integer)
returns boolean language sql immutable set search_path='' as $function$
 with score as (
  select greatest(p_a,p_b) hi,least(p_a,p_b) lo,
  case when p_best_of>1 and p_index=p_best_of-1 then 15
       when p_modality='quadra_6x6' then 25 else 21 end target
 ) select coalesce(p_best_of in (1,3,5) and p_index>=0 and p_index<p_best_of
  and p_a>=0 and p_b>=0 and case
  when p_modality in ('beach_tennis_duplas','beach_tennis_simples') then
   p_best_of=1 and p_index=0 and ((hi=6 and lo<=4) or (hi=7 and lo in (5,6)))
  else hi>=target and hi-lo>=2 and (hi=target or hi-lo=2) end,false) from score;
$function$;
