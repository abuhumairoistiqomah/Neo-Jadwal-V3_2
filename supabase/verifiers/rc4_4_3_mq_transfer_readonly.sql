-- Read-only RC4.4.3 staging verifier. Run AFTER migration.
SELECT 'mq_transfer_table_exists' AS check_name,
  to_regclass('public.ejadwal_mq_student_transfers_v319') IS NOT NULL AS ok
UNION ALL
SELECT 'confirm_rpc_exists',
  to_regprocedure('public.ejadwal_confirm_mq_student_transfer_v319(uuid,text)') IS NOT NULL
UNION ALL
SELECT 'revoke_rpc_exists',
  to_regprocedure('public.ejadwal_revoke_mq_student_transfer_v319(uuid)') IS NOT NULL
UNION ALL
SELECT 'rls_enabled', EXISTS (
  SELECT 1 FROM pg_class WHERE oid=to_regclass('public.ejadwal_mq_student_transfers_v319') AND relrowsecurity)
UNION ALL
SELECT 'read_policy_exists', EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='ejadwal_mq_student_transfers_v319' AND policyname='ejadwal_mq_transfer_public_read')
UNION ALL
SELECT 'active_unique_index_exists',to_regclass('public.ejadwal_mq_transfer_active_coverage_idx') IS NOT NULL;
