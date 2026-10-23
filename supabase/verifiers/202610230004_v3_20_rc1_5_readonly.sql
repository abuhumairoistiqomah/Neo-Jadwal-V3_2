-- RC1.5 read-only verifier: new RPC and copy audit history.
select
  to_regprocedure('public.ejadwal_copy_incidental_lessons_v320_rc15(date,uuid,integer[],uuid[],boolean,boolean,boolean)') is not null as copy_rpc_exists,
  (select count(*) from public.audit_logs where action = 'COPY_INCIDENTAL_LESSON_RC15') as copied_slot_audit_count;
