CREATE OR REPLACE FUNCTION public.trgfn_app_products_inventory_category_assign_from_bb_categories()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
    v_cat text;
begin
    -- Nur setzen, wenn kein manueller Wert angegeben ist
    if new.inventory_cagtegory is null then
        if coalesce(new.bb_category1, '') in ('WT', 'Küche', 'Rohling', 'Schrank', 'SB', 'Spiegel', 'TV', 'Wohnmöbel')
           or coalesce(new.bb_category2, '') in ('WT', 'Küche', 'Rohling', 'Schrank', 'SB', 'Spiegel', 'TV', 'Wohnmöbel')
           or coalesce(new.bb_category3, '') in ('WT', 'Küche', 'Rohling', 'Schrank', 'SB', 'Spiegel', 'TV', 'Wohnmöbel') then
            v_cat := 'Möbel';

        elsif coalesce(new.bb_category1, '') in ('Armatur', 'Elektrogeräte', 'TV-Zubehör', 'Zubehör')
           or coalesce(new.bb_category2, '') in ('Armatur', 'Elektrogeräte', 'TV-Zubehör', 'Zubehör')
           or coalesce(new.bb_category3, '') in ('Armatur', 'Elektrogeräte', 'TV-Zubehör', 'Zubehör') then
            v_cat := 'Handelswaren';

        elsif coalesce(new.bb_category1, '') in ('WB')
           or coalesce(new.bb_category2, '') in ('WB')
           or coalesce(new.bb_category3, '') in ('WB') then
            v_cat := 'Bauteile';

        elsif coalesce(new.bb_category1, '') in ('Naturstein')
           or coalesce(new.bb_category2, '') in ('Naturstein')
           or coalesce(new.bb_category3, '') in ('Naturstein') then
            v_cat := 'Naturstein';
        else
            v_cat := null;
        end if;

        new.inventory_cagtegory := v_cat;
    end if;

    return new;
end;
$function$;
