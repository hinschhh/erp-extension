import { IResourceItem } from "@refinedev/core";
import {
  ShoppingCartOutlined,
  TagsOutlined,
  ShopOutlined,
  GoldOutlined,
  PhoneOutlined
} from "@ant-design/icons";
import { Agent } from "http";

/**
 * Leitlinien:
 * - name  = stabiler, englischer Identifier (für DataProvider / useList/useShow)
 * - label = deutsch (UI)
 * - Routen = deutsch (Next.js App Router)
 * - parentName nutzt die Sektion "einkauf" bzw. "artikel"
 *
 * Entfernt:
 * - "Artikelübersicht" (Redundanz zu "Artikel")
 * - Inkonsistente/leer definierte Ressourcen
 */
const resources: IResourceItem[] = [
  // --- Sektion: Kundenberatung (nur Navigation/Gruppe)
  {
    name: "kundenberatung",
    list: "/kundenberatung",
    icon: <PhoneOutlined />,
    options: { label: "Kundenberatung" },
  },
  // Reklamationen (DB: app_complaints)
  {
    name: "app_complaints",
    list: "/kundenberatung/reklamationen",
    parentName: "kundenberatung",
    options: { label: "Reklamationen" },
  },

  // ── Sektion: Einkauf (nur Navigation/Gruppe)
  {
    name: "einkauf",
    list: "/einkauf",
    icon: <ShoppingCartOutlined />,
    options: { label: "Einkauf" },
  },

  // Bestellungen (DB: purchase_orders)
  {
    name: "app_purchase_orders",
    list: "/einkauf/bestellungen",
    create: "/einkauf/bestellungen/anlegen",
    show: "/einkauf/bestellungen/anzeigen/:id",
    edit: "/einkauf/bestellungen/bearbeiten/:id",
    parentName: "einkauf",
    options: { label: "Bestellungen" },
  },

  // Bestellvorschläge (falls eigener Screen, optional DB-Resource)
  {
    name: "purchase_order_suggestions",
    list: "/einkauf/bestellvorschlaege",
    parentName: "einkauf",
    meta: { label: "Bestellvorschläge" },
  },

  // Lieferanten (DB: app_suppliers)
  {
    name: "app_suppliers",
    list: "/einkauf/lieferanten",
    create: "/einkauf/lieferanten/anlegen",
    show: "/einkauf/lieferanten/anzeigen/:id",
    edit: "/einkauf/lieferanten/bearbeiten/:id",
    parentName: "einkauf",
    options: { label: "Lieferanten" },
  },

  // ── Sektion: Artikel (nur Navigation/Gruppe)
  {
    name: "artikel",
    list: "/artikel",
    show: "/artikel/anzeigen/:id",
    edit: "/artikel/bearbeiten/:id",
    icon: <TagsOutlined />,
    options: { label: "Artikel" },
  },

  // Artikelübersicht / Produkte (DB: articles oder products; ggf. anpassen)
  {
    name: "articles",
    list: "/artikel",
    show: "/artikel/anzeigen/:id",
    edit: "/artikel/bearbeiten/:id",
    parentName: "artikel",
    options: { label: "Artikelübersicht" },
  },

  {
    name: "lager",
    options: { label: "Lager" },
    icon: <GoldOutlined />,
  },
  // Inventur (eigene Resource/Seite)
  {
    name: "inventory",
    list: "/lager/inventur",
    parentName: "lager",
    options: { label: "Inventur" },
  },

    // Wareneingang (eigene Seite; wenn DB-Resource vorhanden -> Identifier hier angleichen)
  {
    name: "app_inbound_shipments",
    list: "/lager/wareneingang",
    create: "/lager/wareneingang/anlegen",
    show: "/lager/wareneingang/anzeigen/:id",
    edit: "/lager/wareneingang/bearbeiten/:id",
    parentName: "lager",
    options: { label: "Wareneingang" },
  },


];

export default resources;
