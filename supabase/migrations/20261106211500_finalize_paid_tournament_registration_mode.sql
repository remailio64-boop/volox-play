-- Preserve payment verification and idempotency; persist registration mode.
CREATE OR REPLACE FUNCTION public.finalize_tournament_payment(p_payment_row_id uuid, p_provider_payment_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public.tournament_payments%ROWTYPE;
  d jsonb;
  c jsonb;
  t_id uuid;
  v_name text;
  v_slug text;
  v_modality text;
  v_category text;
  v_fee integer;
  v_capacity integer;
  v_count integer;
BEGIN
  -- Bloqueio da linha evita criacao duplicada em notificacoes simultaneas.
  SELECT * INTO p
    FROM public.tournament_payments
   WHERE id = p_payment_row_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento nao encontrado';
  END IF;

  IF p.provider_payment_id IS DISTINCT FROM p_provider_payment_id
     OR p_provider_payment_id IS NULL
     OR btrim(p_provider_payment_id) = '' THEN
    RAISE EXCEPTION 'Identificador do pagamento divergente';
  END IF;

  IF p.amount_cents <> 2990 THEN
    RAISE EXCEPTION 'Valor do pagamento incorreto';
  END IF;

  IF p.status = 'approved' AND p.tournament_id IS NOT NULL THEN
    RETURN p.tournament_id;
  END IF;

  IF p.status <> 'pending' OR p.tournament_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pagamento nao elegivel';
  END IF;

  d := p.tournament_data;
  IF d IS NULL OR jsonb_typeof(d) <> 'object'
     OR jsonb_typeof(d->'categories') <> 'array' THEN
    RAISE EXCEPTION 'Dados do campeonato invalidos';
  END IF;

  v_count := jsonb_array_length(d->'categories');
  -- Limite tecnico por requisicao; nao e cobranca por categoria.
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'Quantidade de categorias invalida (1 a 100)';
  END IF;

  v_name := btrim(d->>'name');
  IF v_name IS NULL OR length(v_name) < 3 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'Nome do campeonato invalido';
  END IF;

  -- Validar TODAS as categorias antes de inserir o campeonato.
  FOR c IN SELECT value FROM jsonb_array_elements(d->'categories') LOOP
    IF jsonb_typeof(c) <> 'object'
       OR jsonb_typeof(c->'fee_cents') <> 'number'
       OR jsonb_typeof(c->'capacity') <> 'number'
       OR (c->>'fee_cents') !~ '^[0-9]+$'
       OR (c->>'capacity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Formato de categoria invalido';
    END IF;

    v_modality := c->>'modality';
    v_category := btrim(c->>'name');
    v_fee := (c->>'fee_cents')::integer;
    v_capacity := (c->>'capacity')::integer;

    IF v_modality IS NULL
       OR v_modality NOT IN ('areia_2x2','areia_4x4','quadra_6x6','beach_tennis_duplas','beach_tennis_simples')
       OR v_category IS NULL OR length(v_category) < 1 OR length(v_category) > 60
       OR coalesce(c->>'registration_mode','formed') NOT IN ('formed','drawn')
       OR (coalesce(c->>'registration_mode','formed')='drawn' AND v_modality NOT IN ('areia_2x2','areia_4x4','beach_tennis_duplas'))
       OR (coalesce(c->>'registration_mode','formed')='drawn' AND v_capacity % (CASE WHEN v_modality='areia_4x4' THEN 4 ELSE 2 END) <> 0)
       OR v_fee < 0 OR v_capacity NOT BETWEEN 2 AND 512 THEN
      RAISE EXCEPTION 'Categoria invalida';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT lower(btrim(value->>'name')) AS nome
          FROM jsonb_array_elements(d->'categories')
      ) x
     GROUP BY nome
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Categorias com nomes repetidos';
  END IF;

  v_slug := trim(both '-' from left(
    regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), 40
  )) || '-' || replace(p.id::text, '-', '');

  c := d->'categories'->0;

  INSERT INTO public.tournaments (
    organizer_id, name, slug, modality, fee_cents, capacity,
    category, status, approval_mode
  ) VALUES (
    p.organizer_id, v_name, v_slug, c->>'modality',
    (c->>'fee_cents')::integer, (c->>'capacity')::integer,
    btrim(c->>'name'), 'open', 'manual'
  ) RETURNING id INTO t_id;

  FOR c IN SELECT value FROM jsonb_array_elements(d->'categories') LOOP
    INSERT INTO public.tournament_categories (
      tournament_id, name, modality, fee_cents, capacity, best_of, registration_mode
    ) VALUES (
      t_id, btrim(c->>'name'), c->>'modality',
      (c->>'fee_cents')::integer, (c->>'capacity')::integer, case when c->>'modality' in ('beach_tennis_duplas','beach_tennis_simples') then 1 else 3 end, coalesce(c->>'registration_mode','formed')
    );
  END LOOP;

  UPDATE public.tournament_payments
     SET status = 'approved', tournament_id = t_id
   WHERE id = p.id;

  RETURN t_id;
END;
$function$
;
