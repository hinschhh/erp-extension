CREATE OR REPLACE FUNCTION public.trgfn_generic_audit_logs_row_insert_update_delete_log()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_batch uuid := public.audit_current_tag();
  v_user  uuid := auth.uid();
  v_entity_id text;
BEGIN
  IF v_user IS NULL THEN
    v_user := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  v_entity_id := COALESCE((CASE WHEN TG_OP <> 'DELETE' THEN NEW.id::text END),
                          (CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text END));

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_name, entity_id, old_values, new_values, created_at, batch_id)
    VALUES (v_user, 'INSERT', TG_TABLE_NAME, v_entity_id, NULL, to_jsonb(NEW), now(), v_batch);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_name, entity_id, old_values, new_values, created_at, batch_id)
    VALUES (v_user, 'UPDATE', TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), to_jsonb(NEW), now(), v_batch);
    RETURN NEW;

  ELSE
    INSERT INTO public.audit_logs(user_id, action, entity_name, entity_id, old_values, new_values, created_at, batch_id)
    VALUES (v_user, 'DELETE', TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), NULL, now(), v_batch);
    RETURN OLD;
  END IF;
END;
$function$;
