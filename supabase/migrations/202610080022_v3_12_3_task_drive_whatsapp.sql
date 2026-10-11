begin;

create or replace function public.ejadwal_save_inval_bundle_v2(
  p_rows jsonb,
  p_room_incidental jsonb default null,
  p_override_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_row jsonb;
  v_index int := 0;
  v_slot_id uuid;
  v_task_id uuid;
  v_resource jsonb;
  v_type text;
  v_url text;
  v_drive_id text;
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  v_result := public.ejadwal_save_inval_bundle(p_rows, p_room_incidental, p_override_note);

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_slot_id := nullif(v_result->'coverage_slot_ids'->>v_index, '')::uuid;
    v_index := v_index + 1;
    if v_slot_id is null then continue; end if;

    if v_row ? 'task_resources' and jsonb_typeof(coalesce(v_row->'task_resources', '[]'::jsonb)) = 'array' then
      select id into v_task_id
      from public.learning_tasks
      where coverage_slot_id = v_slot_id and deleted_at is null
      order by created_at
      limit 1;

      if v_task_id is null and jsonb_array_length(coalesce(v_row->'task_resources', '[]'::jsonb)) > 0 then
        insert into public.learning_tasks (coverage_slot_id, description, created_by)
        values (v_slot_id, nullif(trim(coalesce(v_row->>'task_text','')), ''), auth.uid())
        returning id into v_task_id;
      end if;

      if v_task_id is not null then
        delete from public.task_resources where task_id = v_task_id;
      end if;

      for v_resource in select value from jsonb_array_elements(coalesce(v_row->'task_resources', '[]'::jsonb))
      loop
        v_type := upper(trim(coalesce(v_resource->>'resource_type','LINK')));
        v_url := trim(coalesce(v_resource->>'url',''));
        v_drive_id := nullif(trim(coalesce(v_resource->>'drive_file_id','')), '');
        if v_url = '' then continue; end if;
        if v_type not in ('LINK','DRIVE_FILE') then raise exception 'INVALID_TASK_RESOURCE_TYPE'; end if;
        if v_type = 'DRIVE_FILE' and v_drive_id is null then raise exception 'DRIVE_FILE_ID_REQUIRED'; end if;

        if v_task_id is null then raise exception 'TASK_ID_REQUIRED_FOR_RESOURCE'; end if;
        insert into public.task_resources(task_id, resource_type, label, url, drive_file_id, file_name, mime_type)
        values (
          v_task_id, v_type,
          nullif(trim(coalesce(v_resource->>'label','')), ''),
          v_url, v_drive_id,
          nullif(trim(coalesce(v_resource->>'file_name','')), ''),
          nullif(trim(coalesce(v_resource->>'mime_type','')), '')
        );
      end loop;

      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data, request_id)
      values (auth.uid(), 'TASK_RESOURCES_SYNC', 'coverage_slot', v_slot_id::text,
              jsonb_build_object('coverage_slot_id',v_slot_id,'resource_count',jsonb_array_length(v_row->'task_resources')),
              nullif(v_result->>'request_id','')::uuid);
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.ejadwal_save_inval_bundle_v2(jsonb,jsonb,text) from public;
revoke all on function public.ejadwal_save_inval_bundle_v2(jsonb,jsonb,text) from anon;
grant execute on function public.ejadwal_save_inval_bundle_v2(jsonb,jsonb,text) to authenticated;

comment on function public.ejadwal_save_inval_bundle_v2(jsonb,jsonb,text) is
  'V3.12.3 Inval write wrapper: canonical coverage/task write plus structured task_resources for Drive/link attachments.';

commit;
