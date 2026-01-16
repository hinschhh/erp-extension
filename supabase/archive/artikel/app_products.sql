create table public.app_products (
  created_at timestamp with time zone not null default now(),
  bb_sku text null,
  id bigint not null,
  bb_is_bom boolean null,
  bb_is_active boolean null,
  bb_category1 text null,
  bb_category2 text null,
  bb_category3 text null,
  bb_net_purchase_price numeric null,
  supplier_sku text null,
  purchase_details text null,
  fk_bb_supplier text null,
  bb_name text null,
  inventory_cagtegory text null,
  production_required text GENERATED ALWAYS as (
    case
      when (
        (
          COALESCE(bb_category1, ''::text) ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::text
        )
        or (
          COALESCE(bb_category2, ''::text) ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::text
        )
        or (
          COALESCE(bb_category3, ''::text) ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::text
        )
      ) then 'On Demand - Externe Bestellung/Produktion erforderlich'::text
      when (
        (
          COALESCE(bb_category1, ''::text) ~~* '%Produktion erforderlich%'::text
        )
        or (
          COALESCE(bb_category2, ''::text) ~~* '%Produktion erforderlich%'::text
        )
        or (
          COALESCE(bb_category3, ''::text) ~~* '%Produktion erforderlich%'::text
        )
      ) then 'Produktion erforderlich'::text
      when (
        (
          COALESCE(bb_category1, ''::text) ~~* '%Produktion nicht erforderlich%'::text
        )
        or (
          COALESCE(bb_category2, ''::text) ~~* '%Produktion nicht erforderlich%'::text
        )
        or (
          COALESCE(bb_category3, ''::text) ~~* '%Produktion nicht erforderlich%'::text
        )
      ) then 'Produktion nicht erforderlich'::text
      else '-'::text
    end
  ) STORED null,
  "bb_Price" numeric null,
  "bb_Net" numeric null,
  is_variant_set boolean GENERATED ALWAYS as (
    (
      (bb_category1 = 'Varianten-Set'::text)
      or (bb_category2 = 'Varianten-Set'::text)
      or (bb_category3 = 'Varianten-Set'::text)
    )
  ) STORED null,
  is_antique boolean GENERATED ALWAYS as (
    (
      (bb_category1 = 'Antike Ware'::text)
      or (bb_category2 = 'Antike Ware'::text)
      or (bb_category3 = 'Antike Ware'::text)
    )
  ) STORED null,
  product_type text GENERATED ALWAYS as (
    case
      when (
        bb_category1 = any (
          array[
            'Armatur'::text,
            'Badezimmer-Set'::text,
            'Elektrogeräte'::text,
            'Küche'::text,
            'Schrank'::text,
            'Spiegel'::text,
            'TV'::text,
            'TV-Zubehör'::text,
            'WB'::text,
            'Wohnmöbel'::text,
            'WT'::text,
            'Zubehör'::text
          ]
        )
      ) then bb_category1
      when (
        bb_category2 = any (
          array[
            'Armatur'::text,
            'Badezimmer-Set'::text,
            'Elektrogeräte'::text,
            'Küche'::text,
            'Schrank'::text,
            'Spiegel'::text,
            'TV'::text,
            'TV-Zubehör'::text,
            'WB'::text,
            'Wohnmöbel'::text,
            'WT'::text,
            'Zubehör'::text
          ]
        )
      ) then bb_category2
      when (
        bb_category3 = any (
          array[
            'Armatur'::text,
            'Badezimmer-Set'::text,
            'Elektrogeräte'::text,
            'Küche'::text,
            'Schrank'::text,
            'Spiegel'::text,
            'TV'::text,
            'TV-Zubehör'::text,
            'WB'::text,
            'Wohnmöbel'::text,
            'WT'::text,
            'Zubehör'::text
          ]
        )
      ) then bb_category3
      else null::text
    end
  ) STORED null,
  room text GENERATED ALWAYS as (
    case
      when (
        (
          bb_category1 = any (
            array[
              'Armatur'::text,
              'Badezimmer-Set'::text,
              'Schrank'::text,
              'Spiegel'::text,
              'WB'::text,
              'WT'::text,
              'Zubehör'::text
            ]
          )
        )
        or (
          bb_category2 = any (
            array[
              'Armatur'::text,
              'Badezimmer-Set'::text,
              'Schrank'::text,
              'Spiegel'::text,
              'WB'::text,
              'WT'::text,
              'Zubehör'::text
            ]
          )
        )
        or (
          bb_category3 = any (
            array[
              'Armatur'::text,
              'Badezimmer-Set'::text,
              'Schrank'::text,
              'Spiegel'::text,
              'WB'::text,
              'WT'::text,
              'Zubehör'::text
            ]
          )
        )
      ) then 'Bad'::text
      when (
        (
          bb_category1 = any (array['Küche'::text, 'Elektrogeräte'::text])
        )
        or (
          bb_category2 = any (array['Küche'::text, 'Elektrogeräte'::text])
        )
        or (
          bb_category3 = any (array['Küche'::text, 'Elektrogeräte'::text])
        )
      ) then 'Küche'::text
      when (
        (
          bb_category1 = any (array['TV'::text, 'TV-Zubehör'::text])
        )
        or (
          bb_category2 = any (array['TV'::text, 'TV-Zubehör'::text])
        )
        or (
          bb_category3 = any (array['TV'::text, 'TV-Zubehör'::text])
        )
      ) then 'TV'::text
      when (
        (bb_category1 = 'Wohnmöbel'::text)
        or (bb_category2 = 'Wohnmöbel'::text)
        or (bb_category3 = 'Wohnmöbel'::text)
      ) then 'Wohnmöbel'::text
      when (
        (
          bb_category1 = any (
            array[
              'Naturstein'::text,
              'Platte'::text,
              'Rohling'::text,
              'SB'::text
            ]
          )
        )
        or (
          bb_category2 = any (
            array[
              'Naturstein'::text,
              'Platte'::text,
              'Rohling'::text,
              'SB'::text
            ]
          )
        )
        or (
          bb_category3 = any (
            array[
              'Naturstein'::text,
              'Platte'::text,
              'Rohling'::text,
              'SB'::text
            ]
          )
        )
      ) then 'Komponente'::text
      when (
        (bb_category1 = 'Service'::text)
        or (bb_category2 = 'Service'::text)
        or (bb_category3 = 'Service'::text)
      ) then 'Service'::text
      else null::text
    end
  ) STORED null,
  constraint app_products_pkey primary key (id),
  constraint app_products_bb_product_id_key unique (id),
  constraint app_products_fk_bb_supplier_fkey foreign KEY (fk_bb_supplier) references app_suppliers (id),
  constraint app_products_inventory_cagtegory_fkey foreign KEY (inventory_cagtegory) references app_products_inventory_categories (inventory_category)
) TABLESPACE pg_default;

create trigger trg_set_inventory_category BEFORE INSERT
or
update on app_products for EACH row
execute FUNCTION trgfn_app_products_inventory_category_assign_from_bb_categories ();