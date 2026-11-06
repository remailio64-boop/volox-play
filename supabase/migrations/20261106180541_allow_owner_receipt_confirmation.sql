-- RLS restricts the UPDATE to the tournament's existing organizer; the trigger
-- allows only pending -> paid and derives the audit fields on the server.
grant update(payment_status) on public.registrations to authenticated;
