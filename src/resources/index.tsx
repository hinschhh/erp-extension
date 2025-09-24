import { IResourceItem } from "@refinedev/core";
import { BarcodeOutlined, ShoppingCartOutlined, TagsOutlined, ToolOutlined } from "@ant-design/icons";


const resources: IResourceItem[] = [
/*{
  "name": "produktion",
  "list": "/produktion",
  "create": "/produktion/anlegen",
  "show": "/produktion/anzeigen/:id",
  "edit": "/produktion/bearbeiten/:id",
  icon: <ToolOutlined/> ,
  options: {
    label: "Produktion",
  }
},
{
    "name": "Übersicht Produktionsaufträge",
    "list": "/produktion",
    "parentName": "produktion",
    options: {
      label: "Übersicht Produktionsaufträge",
    }
},
{
    "name": "Lackiererei",
    "list": "/produktion/lackiererei",
    "parentName": "produktion",
    options: {
      label: "Lackiererei",
    }
},
{
    "name": "Tischlerei",
    "list": "/produktion/tischlerei",
    "parentName": "produktion",
    options: {
      label: "Tischlerei",
    }
},*/
{
  "name": "einkauf",
  "list": "/einkauf",
  "create": "/einkauf/create",
  "show": "/einkauf/show/:id",
  "edit": "/einkauf/edit/:id",
  icon: <ShoppingCartOutlined/> ,
  options: {
    label: "Einkauf",
  }
},
{
    "name": "Bestellungen",
    "list": "/einkauf/bestellungen",
    "create": "/einkauf/bestellungen/anlegen",
    "edit": "/einkauf/bestellungen/bearbeiten/:id",
    "parentName": "einkauf",
    options: {
      label: "Bestellungen",
    }
},
{
    "name": "Bestellvorschläge",
    "list": "/einkauf/bestellvorschlaege",
    "parentName": "einkauf",
    options: {
      label: "Bestellvorschläge",
    }
},

{
    "name": "lieferanten",
    "list": "/einkauf/lieferanten",
    "create": "/einkauf/lieferanten/anlegen",
    "edit": "/einkauf/lieferanten/bearbeiten/:id",
    "parentName": "einkauf",
    options: {
    label: "Lieferanten",
  }
},
{
    "name": "Wareneingang",
    "list": "/einkauf/wareneingang",
    "parentName": "einkauf",
    options: {
      label: "Wareneingang",
      icon: <BarcodeOutlined />,
    }
},
{
  "name": "Artikel",
  "list": "/artikel",
  "show": "/artikel/anzeigen/:id",
  "edit": "/artikel/bearbeiten/:id",
  icon: <TagsOutlined/> ,
  options: {
    label: "Artikel",
  }
},
{
  "name": "Artikelübersicht", 
  "list": "/artikel",
  "parentName": "Artikel",
  options: {
    label: "Artikelübersicht",
  }
},
{
    "name": "Inventur",
    "list": "/artikel/inventur",
    "parentName": "Artikel",
    options: {
      label: "Inventur",
    }
},
{"name": "bom_recipes",}
]


export default resources;