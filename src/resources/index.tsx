import { IResourceItem } from "@refinedev/core";
import { ShoppingCartOutlined } from "@ant-design/icons";


const resources: IResourceItem[] = [
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
    "create": "/einkauf/lieferanten/create",
    "show": "/einkauf/lieferanten/show/:id",
    "edit": "/einkauf/lieferanten/edit/:id",
    "parentName": "einkauf",
    options: {
    label: "Lieferanten",
  }
},
]


export default resources;