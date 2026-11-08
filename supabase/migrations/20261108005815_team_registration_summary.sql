create function volox_private.team_registration_summary(p_registration_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('team_name',r.team_name,'tournament_name',t.name,
  'category_name',coalesce(c.name,t.category),'status',r.status,'payment_status',r.payment_status,
  'members',coalesce((select jsonb_agg(jsonb_build_object('name',p.display_name,'status',ra.status,
   'is_me',ra.athlete_id=auth.uid()) order by ra.slot)
   from public.registration_athletes ra join public.athlete_profiles p on p.id=ra.athlete_id
   where ra.registration_id=r.id),'[]'::jsonb))
 from public.registrations r join public.tournaments t on t.id=r.tournament_id
 left join public.tournament_categories c on c.id=r.category_id
 where r.id=p_registration_id and auth.uid() is not null
 and (r.submitted_by=auth.uid() or t.organizer_id=auth.uid() or exists(
  select 1 from public.registration_athletes own where own.registration_id=r.id and own.athlete_id=auth.uid()));
$$;
revoke all on function volox_private.team_registration_summary(uuid) from public,anon,authenticated;
grant execute on function volox_private.team_registration_summary(uuid) to authenticated;
create function public.get_team_registration_summary(p_registration_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select volox_private.team_registration_summary(p_registration_id);
$$;
revoke all on function public.get_team_registration_summary(uuid) from public,anon,authenticated;
grant execute on function public.get_team_registration_summary(uuid) to authenticated;
