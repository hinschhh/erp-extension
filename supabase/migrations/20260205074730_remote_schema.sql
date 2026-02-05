alter table "public"."app_complaint_timeline" add constraint "app_complaint_timeline_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."app_complaint_timeline" validate constraint "app_complaint_timeline_created_by_fkey";


  create policy "authenticated"
  on "public"."app_complaint_timeline"
  as permissive
  for all
  to public
using ((auth.role() = 'authenticated'::text));



