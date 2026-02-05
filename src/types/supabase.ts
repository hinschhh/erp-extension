export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      app_complaint_causes: {
        Row: {
          created_at: string
          id: number
          label: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          label?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          label?: string | null
        }
        Relationships: []
      }
      app_complaint_responsibilities: {
        Row: {
          created_at: string
          id: number
          label: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          label?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          label?: string | null
        }
        Relationships: []
      }
      app_complaint_timeline: {
        Row: {
          created_at: string
          created_by: string | null
          event: string | null
          fk_complaint: number | null
          id: number
          is_solution: boolean | null
          message: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event?: string | null
          fk_complaint?: number | null
          id?: number
          is_solution?: boolean | null
          message?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event?: string | null
          fk_complaint?: number | null
          id?: number
          is_solution?: boolean | null
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_complaint_timeline_created_by_fkey1"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_complaint_timeline_fk_complaint_fkey"
            columns: ["fk_complaint"]
            isOneToOne: false
            referencedRelation: "app_complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      app_complaints: {
        Row: {
          created_at: string
          description: string | null
          fk_app_order_items_id: number | null
          fk_app_orders_id: number | null
          fk_cause: number | null
          fk_responsibility: number | null
          id: number
          improvement_idea: string | null
          is_external: boolean | null
          stage: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fk_app_order_items_id?: number | null
          fk_app_orders_id?: number | null
          fk_cause?: number | null
          fk_responsibility?: number | null
          id?: number
          improvement_idea?: string | null
          is_external?: boolean | null
          stage: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fk_app_order_items_id?: number | null
          fk_app_orders_id?: number | null
          fk_cause?: number | null
          fk_responsibility?: number | null
          id?: number
          improvement_idea?: string | null
          is_external?: boolean | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_complaints_fk_app_order_items_id_fkey"
            columns: ["fk_app_order_items_id"]
            isOneToOne: false
            referencedRelation: "app_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_complaints_fk_app_orders_id_fkey"
            columns: ["fk_app_orders_id"]
            isOneToOne: false
            referencedRelation: "app_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_complaints_fk_cause_fkey"
            columns: ["fk_cause"]
            isOneToOne: false
            referencedRelation: "app_complaint_causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_complaints_fk_responsibility_fkey"
            columns: ["fk_responsibility"]
            isOneToOne: false
            referencedRelation: "app_complaint_responsibilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_complaints_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "app_complaints_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      app_complaints_stages: {
        Row: {
          created_at: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      app_customers: {
        Row: {
          bb_Email: string | null
          bb_InvoiceAddress_CountryISO2: string | null
          bb_InvoiceAddress_Zip: string | null
          bb_Name: string | null
          bb_Number: number | null
          bb_PriceGroupId: number | null
          bb_ShippingAddress_CountryISO2: string | null
          bb_ShippingAddress_Zip: string | null
          bb_Tel1: string | null
          bb_Tel2: string | null
          bb_Type: number | null
          bb_VatId: string | null
          created_at: string
          id: number
        }
        Insert: {
          bb_Email?: string | null
          bb_InvoiceAddress_CountryISO2?: string | null
          bb_InvoiceAddress_Zip?: string | null
          bb_Name?: string | null
          bb_Number?: number | null
          bb_PriceGroupId?: number | null
          bb_ShippingAddress_CountryISO2?: string | null
          bb_ShippingAddress_Zip?: string | null
          bb_Tel1?: string | null
          bb_Tel2?: string | null
          bb_Type?: number | null
          bb_VatId?: string | null
          created_at?: string
          id?: number
        }
        Update: {
          bb_Email?: string | null
          bb_InvoiceAddress_CountryISO2?: string | null
          bb_InvoiceAddress_Zip?: string | null
          bb_Name?: string | null
          bb_Number?: number | null
          bb_PriceGroupId?: number | null
          bb_ShippingAddress_CountryISO2?: string | null
          bb_ShippingAddress_Zip?: string | null
          bb_Tel1?: string | null
          bb_Tel2?: string | null
          bb_Type?: number | null
          bb_VatId?: string | null
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      app_inbound_shipment_items: {
        Row: {
          created_at: string
          id: string
          item_status: Database["public"]["Enums"]["is_status"] | null
          order_id: string
          po_item_normal_id: string | null
          po_item_special_id: string | null
          quantity_delivered: number
          shipment_id: string
          shipping_costs_proportional: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_status?: Database["public"]["Enums"]["is_status"] | null
          order_id: string
          po_item_normal_id?: string | null
          po_item_special_id?: string | null
          quantity_delivered: number
          shipment_id: string
          shipping_costs_proportional?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_status?: Database["public"]["Enums"]["is_status"] | null
          order_id?: string
          po_item_normal_id?: string | null
          po_item_special_id?: string | null
          quantity_delivered?: number
          shipment_id?: string
          shipping_costs_proportional?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_inbound_shipment_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "app_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_inbound_shipment_items_po_item_normal_id_fkey"
            columns: ["po_item_normal_id"]
            isOneToOne: false
            referencedRelation: "app_purchase_orders_positions_normal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_inbound_shipment_items_po_item_special_id_fkey"
            columns: ["po_item_special_id"]
            isOneToOne: false
            referencedRelation: "app_purchase_orders_positions_special"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_inbound_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "app_inbound_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      app_inbound_shipments: {
        Row: {
          created_at: string
          created_by: string
          delivered_at: string
          delivery_note_file_url: string | null
          delivery_note_number: string | null
          fk_bb_supplier: string | null
          id: string
          inbound_number: string | null
          invoice_date: string | null
          invoice_file_url: string | null
          invoice_number: string | null
          note: string | null
          shipping_cost: number | null
          shipping_cost_invoice_file_url: string | null
          shipping_cost_invoice_number: string | null
          status: Database["public"]["Enums"]["is_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          delivered_at?: string
          delivery_note_file_url?: string | null
          delivery_note_number?: string | null
          fk_bb_supplier?: string | null
          id?: string
          inbound_number?: string | null
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          note?: string | null
          shipping_cost?: number | null
          shipping_cost_invoice_file_url?: string | null
          shipping_cost_invoice_number?: string | null
          status?: Database["public"]["Enums"]["is_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          delivered_at?: string
          delivery_note_file_url?: string | null
          delivery_note_number?: string | null
          fk_bb_supplier?: string | null
          id?: string
          inbound_number?: string | null
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          note?: string | null
          shipping_cost?: number | null
          shipping_cost_invoice_file_url?: string | null
          shipping_cost_invoice_number?: string | null
          status?: Database["public"]["Enums"]["is_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_inbound_shipments_fk_bb_supplier_fkey"
            columns: ["fk_bb_supplier"]
            isOneToOne: false
            referencedRelation: "app_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_inventory_adjustments: {
        Row: {
          created_at: string
          delta: number
          error_message: string | null
          fk_products: number
          fk_stocks: number
          id: number
          note: string | null
          session_id: number
          source_count_id: number | null
          status: string
        }
        Insert: {
          created_at?: string
          delta: number
          error_message?: string | null
          fk_products: number
          fk_stocks: number
          id?: number
          note?: string | null
          session_id: number
          source_count_id?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          delta?: number
          error_message?: string | null
          fk_products?: number
          fk_stocks?: number
          id?: number
          note?: string | null
          session_id?: number
          source_count_id?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_adjustments_fk_stocks_fkey"
            columns: ["fk_stocks"]
            isOneToOne: false
            referencedRelation: "app_stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "app_inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_source_count_id_fkey"
            columns: ["source_count_id"]
            isOneToOne: false
            referencedRelation: "app_inventory_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_inventory_counts: {
        Row: {
          counted_by: string | null
          created_at: string
          fk_products: number
          fk_stocks: number
          id: number
          note: string | null
          qty_sellable: number
          qty_unsellable: number
          session_id: number
          stock_location: number | null
        }
        Insert: {
          counted_by?: string | null
          created_at?: string
          fk_products: number
          fk_stocks: number
          id?: number
          note?: string | null
          qty_sellable?: number
          qty_unsellable?: number
          session_id: number
          stock_location?: number | null
        }
        Update: {
          counted_by?: string | null
          created_at?: string
          fk_products?: number
          fk_stocks?: number
          id?: number
          note?: string | null
          qty_sellable?: number
          qty_unsellable?: number
          session_id?: number
          stock_location?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "app_inventory_counts_stock_location_fkey"
            columns: ["stock_location"]
            isOneToOne: false
            referencedRelation: "app_stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_counts_fk_stocks_fkey"
            columns: ["fk_stocks"]
            isOneToOne: false
            referencedRelation: "app_stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "app_inventory_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_inventory_sessions: {
        Row: {
          closed_at: string | null
          counting_started_at: string | null
          created_at: string
          fk_stocks: number | null
          id: number
          name: string
          note: string | null
          snapshot_taken_at: string | null
          status: string
        }
        Insert: {
          closed_at?: string | null
          counting_started_at?: string | null
          created_at?: string
          fk_stocks?: number | null
          id?: number
          name: string
          note?: string | null
          snapshot_taken_at?: string | null
          status?: string
        }
        Update: {
          closed_at?: string | null
          counting_started_at?: string | null
          created_at?: string
          fk_stocks?: number | null
          id?: number
          name?: string
          note?: string | null
          snapshot_taken_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_inventory_sessions_fk_stocks_fkey"
            columns: ["fk_stocks"]
            isOneToOne: false
            referencedRelation: "app_stocks"
            referencedColumns: ["id"]
          },
        ]
      }
      app_inventory_snapshots: {
        Row: {
          bb_stock_current: number
          bb_unfullfilled_amount: number | null
          created_at: string
          fk_products: number
          fk_stocks: number
          id: number
          qty_unsellable: number | null
          session_id: number
          snapshot_taken_at: string
          source_stock_level_id: number | null
          stock_location: string | null
        }
        Insert: {
          bb_stock_current: number
          bb_unfullfilled_amount?: number | null
          created_at?: string
          fk_products: number
          fk_stocks: number
          id?: number
          qty_unsellable?: number | null
          session_id: number
          snapshot_taken_at?: string
          source_stock_level_id?: number | null
          stock_location?: string | null
        }
        Update: {
          bb_stock_current?: number
          bb_unfullfilled_amount?: number | null
          created_at?: string
          fk_products?: number
          fk_stocks?: number
          id?: number
          qty_unsellable?: number | null
          session_id?: number
          snapshot_taken_at?: string
          source_stock_level_id?: number | null
          stock_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_inventory_snapshots_fk_stocks_fkey"
            columns: ["fk_stocks"]
            isOneToOne: false
            referencedRelation: "app_stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_inventory_snapshots_source_stock_level_id_fkey"
            columns: ["source_stock_level_id"]
            isOneToOne: false
            referencedRelation: "app_stock_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_snapshots_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_snapshots_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_snapshots_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "app_inventory_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_order_item_attributes: {
        Row: {
          bb_Name: string | null
          bb_Value: string | null
          created_at: string
          fk_app_order_items_id: number | null
          id: number
        }
        Insert: {
          bb_Name?: string | null
          bb_Value?: string | null
          created_at?: string
          fk_app_order_items_id?: number | null
          id?: number
        }
        Update: {
          bb_Name?: string | null
          bb_Value?: string | null
          created_at?: string
          fk_app_order_items_id?: number | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "app_order_item_attributes_fk_app_order_items_id_fkey"
            columns: ["fk_app_order_items_id"]
            isOneToOne: false
            referencedRelation: "app_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      app_order_items: {
        Row: {
          bb_Dicount: number | null
          bb_DontAdjustStock: boolean | null
          bb_GetPriceFromArticleIfAny: boolean | null
          bb_InvoiceSKU: string | null
          bb_IsCoupon: boolean | null
          bb_Quantity: number | null
          bb_SerialNumber: string | null
          bb_ShippingProfileId: number | null
          bb_StockId: number | null
          bb_TaxAmount: number | null
          bb_TaxIndex: number | null
          bb_TotalPrice: number | null
          bb_TransactionId: string | null
          bb_UnrebatedTotalPrice: number | null
          created_at: string
          deactivated_at: string | null
          fk_app_orders_id: number | null
          fk_app_products_id: number | null
          id: number
          is_active: boolean | null
        }
        Insert: {
          bb_Dicount?: number | null
          bb_DontAdjustStock?: boolean | null
          bb_GetPriceFromArticleIfAny?: boolean | null
          bb_InvoiceSKU?: string | null
          bb_IsCoupon?: boolean | null
          bb_Quantity?: number | null
          bb_SerialNumber?: string | null
          bb_ShippingProfileId?: number | null
          bb_StockId?: number | null
          bb_TaxAmount?: number | null
          bb_TaxIndex?: number | null
          bb_TotalPrice?: number | null
          bb_TransactionId?: string | null
          bb_UnrebatedTotalPrice?: number | null
          created_at?: string
          deactivated_at?: string | null
          fk_app_orders_id?: number | null
          fk_app_products_id?: number | null
          id?: number
          is_active?: boolean | null
        }
        Update: {
          bb_Dicount?: number | null
          bb_DontAdjustStock?: boolean | null
          bb_GetPriceFromArticleIfAny?: boolean | null
          bb_InvoiceSKU?: string | null
          bb_IsCoupon?: boolean | null
          bb_Quantity?: number | null
          bb_SerialNumber?: string | null
          bb_ShippingProfileId?: number | null
          bb_StockId?: number | null
          bb_TaxAmount?: number | null
          bb_TaxIndex?: number | null
          bb_TotalPrice?: number | null
          bb_TransactionId?: string | null
          bb_UnrebatedTotalPrice?: number | null
          created_at?: string
          deactivated_at?: string | null
          fk_app_orders_id?: number | null
          fk_app_products_id?: number | null
          id?: number
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "app_order_items_fk_app_orders_id_fkey"
            columns: ["fk_app_orders_id"]
            isOneToOne: false
            referencedRelation: "app_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_order_items_fk_app_products_id_fkey"
            columns: ["fk_app_products_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_order_items_fk_app_products_id_fkey"
            columns: ["fk_app_products_id"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_order_items_fk_app_products_id_fkey"
            columns: ["fk_app_products_id"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
        ]
      }
      app_orders: {
        Row: {
          bb_AdjustmentCost: number | null
          bb_BillbeeShopName: string | null
          bb_ConfirmedAt: string | null
          bb_CreatedAt: string | null
          bb_Currency: string | null
          "bb_import_ab-nummer": string | null
          bb_InvoiceDate: string | null
          bb_InvoiceNumber: string | null
          bb_InvoiceNumberPrefix: string | null
          bb_LastModifiedAt: string | null
          bb_OrderNumber: string | null
          bb_PaidAmount: number | null
          bb_PayedAt: string | null
          bb_Platform: string | null
          bb_SellerComment: string | null
          bb_ShippedAt: string | null
          bb_ShippingCost: number | null
          bb_ShippingProviderName: string | null
          bb_ShippingProviderProductName: string | null
          bb_State: number | null
          bb_TotalCost: number | null
          bb_VatMode: number | null
          bb_WebUrl: string | null
          confirmed_at: string | null
          created_at: string
          fk_app_customers_id: number | null
          id: number
          offered_at: string | null
          ordered_at: string | null
        }
        Insert: {
          bb_AdjustmentCost?: number | null
          bb_BillbeeShopName?: string | null
          bb_ConfirmedAt?: string | null
          bb_CreatedAt?: string | null
          bb_Currency?: string | null
          "bb_import_ab-nummer"?: string | null
          bb_InvoiceDate?: string | null
          bb_InvoiceNumber?: string | null
          bb_InvoiceNumberPrefix?: string | null
          bb_LastModifiedAt?: string | null
          bb_OrderNumber?: string | null
          bb_PaidAmount?: number | null
          bb_PayedAt?: string | null
          bb_Platform?: string | null
          bb_SellerComment?: string | null
          bb_ShippedAt?: string | null
          bb_ShippingCost?: number | null
          bb_ShippingProviderName?: string | null
          bb_ShippingProviderProductName?: string | null
          bb_State?: number | null
          bb_TotalCost?: number | null
          bb_VatMode?: number | null
          bb_WebUrl?: string | null
          confirmed_at?: string | null
          created_at?: string
          fk_app_customers_id?: number | null
          id?: number
          offered_at?: string | null
          ordered_at?: string | null
        }
        Update: {
          bb_AdjustmentCost?: number | null
          bb_BillbeeShopName?: string | null
          bb_ConfirmedAt?: string | null
          bb_CreatedAt?: string | null
          bb_Currency?: string | null
          "bb_import_ab-nummer"?: string | null
          bb_InvoiceDate?: string | null
          bb_InvoiceNumber?: string | null
          bb_InvoiceNumberPrefix?: string | null
          bb_LastModifiedAt?: string | null
          bb_OrderNumber?: string | null
          bb_PaidAmount?: number | null
          bb_PayedAt?: string | null
          bb_Platform?: string | null
          bb_SellerComment?: string | null
          bb_ShippedAt?: string | null
          bb_ShippingCost?: number | null
          bb_ShippingProviderName?: string | null
          bb_ShippingProviderProductName?: string | null
          bb_State?: number | null
          bb_TotalCost?: number | null
          bb_VatMode?: number | null
          bb_WebUrl?: string | null
          confirmed_at?: string | null
          created_at?: string
          fk_app_customers_id?: number | null
          id?: number
          offered_at?: string | null
          ordered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_orders_fk_app_customers_id_fkey"
            columns: ["fk_app_customers_id"]
            isOneToOne: false
            referencedRelation: "app_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_products: {
        Row: {
          acquisition_cost: number
          bb_category1: string | null
          bb_category2: string | null
          bb_category3: string | null
          bb_costnet: number | null
          bb_is_active: boolean | null
          bb_is_bom: boolean | null
          bb_name: string | null
          bb_Net: number | null
          bb_net_purchase_price: number | null
          bb_Price: number | null
          bb_sku: string | null
          cost_price: number
          created_at: string
          fk_bb_supplier: string | null
          id: number
          inventory_cagtegory: string | null
          is_antique: boolean | null
          is_variant_set: boolean | null
          product_type: string | null
          production_required: string | null
          purchase_details: string | null
          room: string | null
          supplier_sku: string | null
          updated_at: string | null
        }
        Insert: {
          acquisition_cost?: number
          bb_category1?: string | null
          bb_category2?: string | null
          bb_category3?: string | null
          bb_costnet?: number | null
          bb_is_active?: boolean | null
          bb_is_bom?: boolean | null
          bb_name?: string | null
          bb_Net?: number | null
          bb_net_purchase_price?: number | null
          bb_Price?: number | null
          bb_sku?: string | null
          cost_price?: number
          created_at?: string
          fk_bb_supplier?: string | null
          id: number
          inventory_cagtegory?: string | null
          is_antique?: boolean | null
          is_variant_set?: boolean | null
          product_type?: string | null
          production_required?: string | null
          purchase_details?: string | null
          room?: string | null
          supplier_sku?: string | null
          updated_at?: string | null
        }
        Update: {
          acquisition_cost?: number
          bb_category1?: string | null
          bb_category2?: string | null
          bb_category3?: string | null
          bb_costnet?: number | null
          bb_is_active?: boolean | null
          bb_is_bom?: boolean | null
          bb_name?: string | null
          bb_Net?: number | null
          bb_net_purchase_price?: number | null
          bb_Price?: number | null
          bb_sku?: string | null
          cost_price?: number
          created_at?: string
          fk_bb_supplier?: string | null
          id?: number
          inventory_cagtegory?: string | null
          is_antique?: boolean | null
          is_variant_set?: boolean | null
          product_type?: string | null
          production_required?: string | null
          purchase_details?: string | null
          room?: string | null
          supplier_sku?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_products_fk_bb_supplier_fkey"
            columns: ["fk_bb_supplier"]
            isOneToOne: false
            referencedRelation: "app_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_products_inventory_cagtegory_fkey"
            columns: ["inventory_cagtegory"]
            isOneToOne: false
            referencedRelation: "app_products_inventory_categories"
            referencedColumns: ["inventory_category"]
          },
        ]
      }
      app_products_inventory_categories: {
        Row: {
          created_at: string
          inventory_category: string
        }
        Insert: {
          created_at?: string
          inventory_category: string
        }
        Update: {
          created_at?: string
          inventory_category?: string
        }
        Relationships: []
      }
      app_purchase_orders: {
        Row: {
          confirmation_file_url: string | null
          confirmation_number: string | null
          confirmed_at: string | null
          created_at: string
          dol_actual_at: string | null
          dol_planned_at: string | null
          id: string
          invoice_date: string | null
          invoice_file_url: string | null
          invoice_number: string | null
          notes: string | null
          order_number: string
          ordered_at: string | null
          separate_invoice_for_shipping_cost: boolean
          shipping_cost_net: number
          status: Database["public"]["Enums"]["po_status"]
          supplier: string | null
          updated_at: string
        }
        Insert: {
          confirmation_file_url?: string | null
          confirmation_number?: string | null
          confirmed_at?: string | null
          created_at?: string
          dol_actual_at?: string | null
          dol_planned_at?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          notes?: string | null
          order_number: string
          ordered_at?: string | null
          separate_invoice_for_shipping_cost?: boolean
          shipping_cost_net?: number
          status?: Database["public"]["Enums"]["po_status"]
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          confirmation_file_url?: string | null
          confirmation_number?: string | null
          confirmed_at?: string | null
          created_at?: string
          dol_actual_at?: string | null
          dol_planned_at?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          notes?: string | null
          order_number?: string
          ordered_at?: string | null
          separate_invoice_for_shipping_cost?: boolean
          shipping_cost_net?: number
          status?: Database["public"]["Enums"]["po_status"]
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_purchase_orders_supplier_fkey"
            columns: ["supplier"]
            isOneToOne: false
            referencedRelation: "app_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_purchase_orders_positions_normal: {
        Row: {
          billbee_product_id: number
          confirmed_at: string | null
          created_at: string
          dol_actual_at: string | null
          dol_planned_at: string | null
          fk_app_order_items_id: number | null
          fk_app_orders_id: number | null
          goods_received_at: string | null
          id: string
          internal_notes: string | null
          order_id: string
          po_item_status: Database["public"]["Enums"]["po_item_status"] | null
          qty_ordered: number
          unit_price_net: number
          updated_at: string
        }
        Insert: {
          billbee_product_id: number
          confirmed_at?: string | null
          created_at?: string
          dol_actual_at?: string | null
          dol_planned_at?: string | null
          fk_app_order_items_id?: number | null
          fk_app_orders_id?: number | null
          goods_received_at?: string | null
          id?: string
          internal_notes?: string | null
          order_id: string
          po_item_status?: Database["public"]["Enums"]["po_item_status"] | null
          qty_ordered?: number
          unit_price_net?: number
          updated_at?: string
        }
        Update: {
          billbee_product_id?: number
          confirmed_at?: string | null
          created_at?: string
          dol_actual_at?: string | null
          dol_planned_at?: string | null
          fk_app_order_items_id?: number | null
          fk_app_orders_id?: number | null
          goods_received_at?: string | null
          id?: string
          internal_notes?: string | null
          order_id?: string
          po_item_status?: Database["public"]["Enums"]["po_item_status"] | null
          qty_ordered?: number
          unit_price_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_purchase_orders_positions_normal_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_normal_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_normal_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_normal_fk_app_order_items_id_fkey"
            columns: ["fk_app_order_items_id"]
            isOneToOne: false
            referencedRelation: "app_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_normal_fk_app_orders_id_fkey"
            columns: ["fk_app_orders_id"]
            isOneToOne: false
            referencedRelation: "app_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_normal_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "app_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      app_purchase_orders_positions_special: {
        Row: {
          base_model_billbee_product_id: number | null
          billbee_product_id: number
          confirmed_at: string | null
          created_at: string
          details_override: string | null
          dol_actual_at: string | null
          dol_planned_at: string | null
          external_file_url: string | null
          fk_app_order_items_id: number | null
          fk_app_orders_id: number | null
          goods_received_at: string | null
          id: string
          internal_notes: string | null
          order_confirmation_ref: string | null
          order_id: string
          po_item_status: Database["public"]["Enums"]["po_item_status"] | null
          qty_ordered: number
          sketch_confirmed_at: string | null
          sketch_needed: boolean | null
          supplier_sku: string | null
          unit_price_net: number
          updated_at: string
        }
        Insert: {
          base_model_billbee_product_id?: number | null
          billbee_product_id: number
          confirmed_at?: string | null
          created_at?: string
          details_override?: string | null
          dol_actual_at?: string | null
          dol_planned_at?: string | null
          external_file_url?: string | null
          fk_app_order_items_id?: number | null
          fk_app_orders_id?: number | null
          goods_received_at?: string | null
          id?: string
          internal_notes?: string | null
          order_confirmation_ref?: string | null
          order_id: string
          po_item_status?: Database["public"]["Enums"]["po_item_status"] | null
          qty_ordered?: number
          sketch_confirmed_at?: string | null
          sketch_needed?: boolean | null
          supplier_sku?: string | null
          unit_price_net?: number
          updated_at?: string
        }
        Update: {
          base_model_billbee_product_id?: number | null
          billbee_product_id?: number
          confirmed_at?: string | null
          created_at?: string
          details_override?: string | null
          dol_actual_at?: string | null
          dol_planned_at?: string | null
          external_file_url?: string | null
          fk_app_order_items_id?: number | null
          fk_app_orders_id?: number | null
          goods_received_at?: string | null
          id?: string
          internal_notes?: string | null
          order_confirmation_ref?: string | null
          order_id?: string
          po_item_status?: Database["public"]["Enums"]["po_item_status"] | null
          qty_ordered?: number
          sketch_confirmed_at?: string | null
          sketch_needed?: boolean | null
          supplier_sku?: string | null
          unit_price_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_purchase_orders_positions_base_model_billbee_product_i_fkey"
            columns: ["base_model_billbee_product_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_base_model_billbee_product_i_fkey"
            columns: ["base_model_billbee_product_id"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_base_model_billbee_product_i_fkey"
            columns: ["base_model_billbee_product_id"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_specia_fk_app_order_items_id_fkey"
            columns: ["fk_app_order_items_id"]
            isOneToOne: false
            referencedRelation: "app_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_special_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_special_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_special_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_special_fk_app_orders_id_fkey"
            columns: ["fk_app_orders_id"]
            isOneToOne: false
            referencedRelation: "app_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_purchase_orders_positions_special_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "app_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      app_stock_levels: {
        Row: {
          bb_StockCode: string | null
          bb_StockCurrent: number | null
          bb_UnfullfilledAmount: number | null
          created_at: string
          fk_products: number | null
          fk_stocks: number | null
          id: number
          qty_unsellable: number | null
          upsert_match_id: string
        }
        Insert: {
          bb_StockCode?: string | null
          bb_StockCurrent?: number | null
          bb_UnfullfilledAmount?: number | null
          created_at?: string
          fk_products?: number | null
          fk_stocks?: number | null
          id?: number
          qty_unsellable?: number | null
          upsert_match_id: string
        }
        Update: {
          bb_StockCode?: string | null
          bb_StockCurrent?: number | null
          bb_UnfullfilledAmount?: number | null
          created_at?: string
          fk_products?: number | null
          fk_stocks?: number | null
          id?: number
          qty_unsellable?: number | null
          upsert_match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_stock_levels_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_stock_levels_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_stock_levels_fk_products_fkey"
            columns: ["fk_products"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "app_stock_levels_fk_stocks_fkey"
            columns: ["fk_stocks"]
            isOneToOne: false
            referencedRelation: "app_stocks"
            referencedColumns: ["id"]
          },
        ]
      }
      app_stock_locations: {
        Row: {
          created_at: string
          fk_app_stocks: number | null
          id: number
          name: string | null
        }
        Insert: {
          created_at?: string
          fk_app_stocks?: number | null
          id?: number
          name?: string | null
        }
        Update: {
          created_at?: string
          fk_app_stocks?: number | null
          id?: number
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_stock_locations_fk_app_stocks_fkey"
            columns: ["fk_app_stocks"]
            isOneToOne: false
            referencedRelation: "app_stocks"
            referencedColumns: ["id"]
          },
        ]
      }
      app_stocks: {
        Row: {
          bb_Description: string | null
          bb_isDefault: boolean | null
          bb_Name: string | null
          created_at: string
          id: number
        }
        Insert: {
          bb_Description?: string | null
          bb_isDefault?: boolean | null
          bb_Name?: string | null
          created_at?: string
          id?: number
        }
        Update: {
          bb_Description?: string | null
          bb_isDefault?: boolean | null
          bb_Name?: string | null
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      app_supplier_contacts: {
        Row: {
          contact_name: string
          created_at: string
          email: string | null
          fk_bb_supplier: string | null
          id: string
          is_default: boolean
          notes: string | null
          phone: string | null
          role_title: string | null
        }
        Insert: {
          contact_name: string
          created_at?: string
          email?: string | null
          fk_bb_supplier?: string | null
          id?: string
          is_default?: boolean
          notes?: string | null
          phone?: string | null
          role_title?: string | null
        }
        Update: {
          contact_name?: string
          created_at?: string
          email?: string | null
          fk_bb_supplier?: string | null
          id?: string
          is_default?: boolean
          notes?: string | null
          phone?: string | null
          role_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_supplier_contacts_fk_bb_supplier_fkey"
            columns: ["fk_bb_supplier"]
            isOneToOne: false
            referencedRelation: "app_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_suppliers: {
        Row: {
          account_number: number | null
          active: boolean
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          default_currency: string
          default_incoterm: string | null
          default_leadtime_days: number
          default_order_channel:
            | Database["public"]["Enums"]["order_channel"]
            | null
          default_payment_method: string | null
          email: string | null
          id: string
          notes: string | null
          payment_terms_days: number
          phone: string | null
          postal_code: string | null
          separate_invoice_for_shipping_cost: boolean | null
          short_code: string | null
          state_region: string | null
          tax_country: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          account_number?: number | null
          active?: boolean
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_currency?: string
          default_incoterm?: string | null
          default_leadtime_days?: number
          default_order_channel?:
            | Database["public"]["Enums"]["order_channel"]
            | null
          default_payment_method?: string | null
          email?: string | null
          id: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          postal_code?: string | null
          separate_invoice_for_shipping_cost?: boolean | null
          short_code?: string | null
          state_region?: string | null
          tax_country?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          account_number?: number | null
          active?: boolean
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_currency?: string
          default_incoterm?: string | null
          default_leadtime_days?: number
          default_order_channel?:
            | Database["public"]["Enums"]["order_channel"]
            | null
          default_payment_method?: string | null
          email?: string | null
          id?: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          postal_code?: string | null
          separate_invoice_for_shipping_cost?: boolean | null
          short_code?: string | null
          state_region?: string | null
          tax_country?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          batch_id: string | null
          created_at: string
          entity_id: string
          entity_name: string
          id: number
          new_values: Json | null
          old_values: Json | null
          user_id: string
        }
        Insert: {
          action: string
          batch_id?: string | null
          created_at?: string
          entity_id: string
          entity_name: string
          id?: number
          new_values?: Json | null
          old_values?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          batch_id?: string | null
          created_at?: string
          entity_id?: string
          entity_name?: string
          id?: number
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      bom_recipes: {
        Row: {
          billbee_bom_id: number
          billbee_component_id: number
          id: number
          quantity: number
          updated_at: string
        }
        Insert: {
          billbee_bom_id: number
          billbee_component_id: number
          id?: number
          quantity: number
          updated_at?: string
        }
        Update: {
          billbee_bom_id?: number
          billbee_component_id?: number
          id?: number
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_recipes_billbee_bom_id_fkey"
            columns: ["billbee_bom_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_recipes_billbee_bom_id_fkey"
            columns: ["billbee_bom_id"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_recipes_billbee_bom_id_fkey"
            columns: ["billbee_bom_id"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "bom_recipes_billbee_component_id_fkey"
            columns: ["billbee_component_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_recipes_billbee_component_id_fkey"
            columns: ["billbee_component_id"]
            isOneToOne: false
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_recipes_billbee_component_id_fkey"
            columns: ["billbee_component_id"]
            isOneToOne: false
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
        ]
      }
      integration_outbox: {
        Row: {
          available_at: string
          created_at: string
          error: string | null
          id: number
          payload: Json
          status: string
          topic: string
        }
        Insert: {
          available_at?: string
          created_at?: string
          error?: string | null
          id?: number
          payload: Json
          status?: string
          topic: string
        }
        Update: {
          available_at?: string
          created_at?: string
          error?: string | null
          id?: number
          payload?: Json
          status?: string
          topic?: string
        }
        Relationships: []
      }
      ops_sync_cursor: {
        Row: {
          kind: string
          next_offset: number
          updated_at: string
        }
        Insert: {
          kind: string
          next_offset: number
          updated_at?: string
        }
        Update: {
          kind?: string
          next_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      ops_sync_runs: {
        Row: {
          finished_at: string | null
          kind: string
          run_date: string
          started_at: string
          status: string
        }
        Insert: {
          finished_at?: string | null
          kind: string
          run_date: string
          started_at?: string
          status: string
        }
        Update: {
          finished_at?: string | null
          kind?: string
          run_date?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      ref_billbee_product_data_enrichment: {
        Row: {
          billbee_product_id: number
          category1: string | null
          category2: string | null
          category3: string | null
          created_at: string
          id: number
          manufacturer: string | null
          net_purchase_price: number | null
        }
        Insert: {
          billbee_product_id: number
          category1?: string | null
          category2?: string | null
          category3?: string | null
          created_at?: string
          id?: number
          manufacturer?: string | null
          net_purchase_price?: number | null
        }
        Update: {
          billbee_product_id?: number
          category1?: string | null
          category2?: string | null
          category3?: string | null
          created_at?: string
          id?: number
          manufacturer?: string | null
          net_purchase_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ref_billbee_product_data_enrichment_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "ref_billbee_products_mirror"
            referencedColumns: ["billbee_product_id"]
          },
        ]
      }
      ref_billbee_product_extension: {
        Row: {
          billbee_product_id: number
          counted_at: string | null
          counted_qty: number | null
          created_at: string
          purchase_details: string | null
          supplier_sku: string | null
          updated_at: string
        }
        Insert: {
          billbee_product_id: number
          counted_at?: string | null
          counted_qty?: number | null
          created_at?: string
          purchase_details?: string | null
          supplier_sku?: string | null
          updated_at?: string
        }
        Update: {
          billbee_product_id?: number
          counted_at?: string | null
          counted_qty?: number | null
          created_at?: string
          purchase_details?: string | null
          supplier_sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ref_billbee_product_extension_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "ref_billbee_products_mirror"
            referencedColumns: ["billbee_product_id"]
          },
        ]
      }
      ref_billbee_products_mirror: {
        Row: {
          billbee_product_id: number
          created_at: string
          id: number
          is_active: boolean | null
          is_bom: boolean | null
          name: string | null
          sku: string | null
        }
        Insert: {
          billbee_product_id: number
          created_at?: string
          id?: number
          is_active?: boolean | null
          is_bom?: boolean | null
          name?: string | null
          sku?: string | null
        }
        Update: {
          billbee_product_id?: number
          created_at?: string
          id?: number
          is_active?: boolean | null
          is_bom?: boolean | null
          name?: string | null
          sku?: string | null
        }
        Relationships: []
      }
      stg_billbee_stock: {
        Row: {
          billbee_product_id: number
          pulled_at: string
          sku: string | null
          stock_available: number
          stock_unavailable: number
        }
        Insert: {
          billbee_product_id: number
          pulled_at?: string
          sku?: string | null
          stock_available?: number
          stock_unavailable?: number
        }
        Update: {
          billbee_product_id?: number
          pulled_at?: string
          sku?: string | null
          stock_available?: number
          stock_unavailable?: number
        }
        Relationships: [
          {
            foreignKeyName: "stg_billbee_stock_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stg_billbee_stock_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stg_billbee_stock_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
        ]
      }
      stg_billbee_stock_committed: {
        Row: {
          billbee_product_id: number
          committed_qty: number
          pulled_at: string
        }
        Insert: {
          billbee_product_id: number
          committed_qty?: number
          pulled_at?: string
        }
        Update: {
          billbee_product_id?: number
          committed_qty?: number
          pulled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stg_billbee_stock_committed_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stg_billbee_stock_committed_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "export_current_purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stg_billbee_stock_committed_billbee_product_id_fkey"
            columns: ["billbee_product_id"]
            isOneToOne: true
            referencedRelation: "rpt_products_inventory_purchasing"
            referencedColumns: ["product_id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      app_component_sales_last_3_months: {
        Row: {
          fk_app_products_id: number | null
          qty_sold_last_3_months: number | null
        }
        Relationships: []
      }
      export_current_purchase_prices: {
        Row: {
          bb_is_active: boolean | null
          bb_is_bom: boolean | null
          bb_net_purchase_price: number | null
          bb_sku: string | null
          id: number | null
          inventory_cagtegory: string | null
          production_required: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_products_inventory_cagtegory_fkey"
            columns: ["inventory_cagtegory"]
            isOneToOne: false
            referencedRelation: "app_products_inventory_categories"
            referencedColumns: ["inventory_category"]
          },
        ]
      }
      rpt_products_inventory_purchasing: {
        Row: {
          bb_category: string | null
          consumption_3m_rolling: number | null
          counted_at: string | null
          counted_qty: number | null
          inventory_cagtegory: string | null
          inventory_value: number | null
          name: string | null
          on_demand: boolean | null
          product_id: number | null
          sku: string | null
          stock_free: number | null
          stock_on_order: number | null
          stock_physical: number | null
          stock_reserved_bom: number | null
          stock_reserved_direct: number | null
          stock_unavailable: number | null
          supplier: string | null
          unit_cost_net: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_products_fk_bb_supplier_fkey"
            columns: ["supplier"]
            isOneToOne: false
            referencedRelation: "app_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_products_inventory_cagtegory_fkey"
            columns: ["inventory_cagtegory"]
            isOneToOne: false
            referencedRelation: "app_products_inventory_categories"
            referencedColumns: ["inventory_category"]
          },
        ]
      }
    }
    Functions: {
      audit_current_tag: { Args: never; Returns: string }
      fn_app_purchase_orders_status_derive_from_items: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_app_purchase_orders_status_derive_from_items_old: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_is_post_and_dispatch: { Args: { p_inbound_id: string }; Returns: Json }
      fn_po_recalc_shipping_allocation: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_util__audit_tag_get: { Args: never; Returns: string }
      fn_util__audit_tag_set: { Args: { p_uuid: string }; Returns: undefined }
      fn_util__text_join_safe: {
        Args: { arr: string[]; sep: string }
        Returns: string
      }
      rpc_app_inventory_session_start: {
        Args: { p_name: string; p_note?: string }
        Returns: {
          closed_at: string | null
          counting_started_at: string | null
          created_at: string
          fk_stocks: number | null
          id: number
          name: string
          note: string | null
          snapshot_taken_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "app_inventory_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_app_purchase_orders_positions_po_item_status_set_for_order: {
        Args: {
          p_dol_planned_at?: string
          p_order_id: string
          p_status: string
        }
        Returns: Json
      }
      rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad: {
        Args: { p_item_id: string }
        Returns: undefined
      }
    }
    Enums: {
      is_status: "planned" | "delivered" | "posted"
      order_channel: "E-Mail" | "Webseite" | "Telefon" | "Sonstiges"
      po_item_kind: "normal" | "special_order" | "pod"
      po_item_status:
        | "draft"
        | "ordered"
        | "confirmed"
        | "in_production"
        | "delivered"
        | "paused"
        | "cancelled"
        | "partially_delivered"
      po_status:
        | "draft"
        | "ordered"
        | "confirmed"
        | "in_production"
        | "partially_in_production"
        | "delivered"
        | "partially_delivered"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      is_status: ["planned", "delivered", "posted"],
      order_channel: ["E-Mail", "Webseite", "Telefon", "Sonstiges"],
      po_item_kind: ["normal", "special_order", "pod"],
      po_item_status: [
        "draft",
        "ordered",
        "confirmed",
        "in_production",
        "delivered",
        "paused",
        "cancelled",
        "partially_delivered",
      ],
      po_status: [
        "draft",
        "ordered",
        "confirmed",
        "in_production",
        "partially_in_production",
        "delivered",
        "partially_delivered",
        "cancelled",
      ],
    },
  },
} as const
