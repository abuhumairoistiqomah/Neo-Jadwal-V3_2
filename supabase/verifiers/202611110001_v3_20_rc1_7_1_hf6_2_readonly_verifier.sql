-- READ-ONLY verifier. Run AFTER the HF6.2 migration in Supabase SQL editor.
select to_regprocedure('public.ejadwal_public_schedule_snapshot_v4()') is not null as v4_exists,
       has_function_privilege('anon', 'public.ejadwal_public_schedule_snapshot_v4()', 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', 'public.ejadwal_public_schedule_snapshot_v4()', 'EXECUTE') as authenticated_can_execute;

with payload as (
  select public.ejadwal_public_schedule_snapshot_v4() as data
)
select jsonb_array_length(data->'coverageSlots') as visible_coverage_slots,
       jsonb_array_length(data->'learningTasks') as readable_learning_tasks,
       jsonb_array_length(data->'taskResources') as readable_task_resources,
       jsonb_array_length(data->'teachers') as visible_teachers
from payload;
-- Do not print task descriptions/links in verifier logs; counts suffice.
