-- E-Jadwal V3.19 RC1: term planning only. Requires V3.18 RC1 migrations.
-- No trigger, cron, or RPC here changes schedule_master, approved leave, or attendance.
-- ONLY active academic_events (existing source of truth) controls date-specific KBM suppression.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ejadwal_operational_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_code text NOT NULL UNIQUE CHECK (length(trim(term_code)) BETWEEN 2 AND 48),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  kbm_start date NOT NULL,
  kbm_end date NOT NULL,
  weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(kbm_end>=kbm_start),
  CHECK(cardinality(weekdays)>0 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
);
CREATE INDEX IF NOT EXISTS ejadwal_operational_terms_dates_idx ON public.ejadwal_operational_terms(kbm_start,kbm_end);
ALTER TABLE public.ejadwal_operational_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ejadwal_operational_terms FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.ejadwal_operational_terms TO authenticated;
DROP POLICY IF EXISTS ejadwal_operational_terms_staff_select ON public.ejadwal_operational_terms;
CREATE POLICY ejadwal_operational_terms_staff_select ON public.ejadwal_operational_terms
  FOR SELECT TO authenticated USING ((SELECT public.current_user_is_staff()));
DROP POLICY IF EXISTS ejadwal_operational_terms_staff_insert ON public.ejadwal_operational_terms;
CREATE POLICY ejadwal_operational_terms_staff_insert ON public.ejadwal_operational_terms
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.current_user_is_staff()));
DROP POLICY IF EXISTS ejadwal_operational_terms_staff_update ON public.ejadwal_operational_terms;
CREATE POLICY ejadwal_operational_terms_staff_update ON public.ejadwal_operational_terms
  FOR UPDATE TO authenticated USING ((SELECT public.current_user_is_staff())) WITH CHECK ((SELECT public.current_user_is_staff()));
-- Term dates are advisory in RC1, NOT yet applied to V3.18 SQL analytics.
COMMIT;
