-- Preparacao aditiva para inscricoes individuais em equipes sorteadas.
-- Nenhum campeonato existente muda de formato.
alter table public.tournament_categories
  add column if not exists registration_mode text not null default 'formed'
  check (registration_mode in ('formed','drawn'));
create table if not exists public.drawn_teams (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  team_number integer not null,
  member_registration_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique (category_id,team_number)
);
alter table public.drawn_teams enable row level security;
revoke all on public.drawn_teams from anon,authenticated;
comment on column public.tournament_categories.registration_mode is
  'formed: equipe completa na inscricao; drawn: inscricao individual e sorteio posterior';
comment on table public.drawn_teams is
  'Equipes sorteadas; acesso apenas por RPCs com autorizacao explicita do organizador.';
