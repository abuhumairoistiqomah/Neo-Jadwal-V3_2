-- E-JADWAL V3.17.2 READ-ONLY CHECK (safe to run in Supabase SQL Editor).
-- Run this in the SAME Supabase project pointed to by the app's VITE_SUPABASE_URL.
-- All required columns and all four new RPCs must say OK after migration.
-- No INSERT/UPDATE/DELETE/DDL: this only inspects catalog metadata.

with required_columns (table_name, column_name) as (values
 ('leave_requests','deleted_at'),
 ('leave_requests','deleted_by'),
 ('leave_requests','deleted_previous_status'),
 ('leave_requests','evidence_required'), -- prerequisite V3.14.6
 ('coverage_slots','deleted_at'),
 ('coverage_slots','deleted_previous_status'),
 ('coverage_slots','class_name_snapshot'),
 ('leave_request_periods','schedule_date'),
 ('leave_request_tasks','description'),
 ('leave_request_slots','period')
)
select 'COLUMN' as item_type, r.table_name||'.'||r.column_name as required_item,
 case when c.column_name is not null then 'OK' else 'MISSING' end as status
from required_columns r
left join information_schema.columns c
  on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
order by r.table_name,r.column_name;

with required_rpcs (signature) as (values
 ('public.ejadwal_submit_staff_leave_v1(text,date,text,text,text,jsonb,jsonb,jsonb,boolean,text)'),
 ('public.ejadwal_move_approved_leave_period_v1(uuid,date,smallint,smallint,text)'),
 ('public.ejadwal_soft_delete_approved_leave_v1(uuid,text)'),
 ('public.ejadwal_restore_approved_leave_v1(uuid,text)'),
 ('public.ejadwal_submit_public_leave_request_v3(text,date,text,text,text,jsonb,jsonb,jsonb)'),
 ('public.ejadwal_decide_leave_request(uuid,text,text)'),
 ('public.current_user_is_staff()')
)
select 'RPC' as item_type, signature as required_item,
 case when to_regprocedure(signature) is not null then 'OK' else 'MISSING' end as status
from required_rpcs
order by signature;
