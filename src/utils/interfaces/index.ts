// src/utils/interfaces/index.ts

/**
 * Interfaces für Billbee API-Modelle und abhängige Typen.
 */

/**
 * Repräsentiert den Billbee OrderModel gemäß Billbee API v1.
 */
export interface Order {
  AcceptLossOfReturnRight: boolean;
  AdjustmentCost: number;
  AdjustmentReason: string;
  BillBeeOrderId: number;
  BillBeeParentOrderId: number;
  Buyer: OrderUser;
  Comments: CommentApiModel[];
  ConfirmedAt: string;
  CreatedAt: string;
  Currency: string;
  CustomInvoiceNote?: string;
  Customer: CustomerApiModel;
  CustomerNumber: string;
  DeliverySourceCountryCode?: string;
  DistributionCenter?: string;
  History: HistoryEntry[];
  Id: string;
  InvoiceAddress: OrderAddressApiModel;
  InvoiceDate: string;
  InvoiceNumber: number;
  InvoiceNumberPostfix?: string;
  InvoiceNumberPrefix?: string;
  IsCancelationFor?: string;
  LanguageCode: string;
  LastModifiedAt: string;
  OrderItems: OrderItem[];
  OrderNumber: string;
  PaidAmount: number;
  PayedAt?: string;
  PaymentInstruction?: string;
  PaymentMethod: number;
  PaymentReference?: string;
  PaymentTransactionId?: string;
  Payments?: OrderPayment[];
  RebateDifference?: number;
  Seller: OrderUser;
  SellerComment?: string;
  ShipWeightKg?: number;
  ShippedAt?: string;
  ShippingAddress: OrderAddressApiModel;
  ShippingCost?: number;
  ShippingIds: Shipment[];
  ShippingProfileId?: string;
  ShippingProfileName?: string;
  ShippingProviderId?: number;
  ShippingProviderName?: string;
  ShippingProviderProductId?: number;
  ShippingProviderProductName?: string;
  ShippingServices?: ProductService[];
  State: number;
  Tags: string[];
  TaxRate1: number;
  TaxRate2?: number;
  TotalCost: number;
  UpdatedAt: string;
  VatId?: string;
  VatMode?: number;
}

/**
 * Repräsentiert einen Benutzer (Buyer oder Seller) in der Bestellung.
 */
export interface OrderUser {
  BillbeeShopId: number;
  BillbeeShopName: string;
  Email: string;
  FirstName: string;
  FullName: string;
  Id: string;
  LastName?: string;
  Nick?: string;
  Platform?: string;
}

/**
 * Repräsentiert einen Kommentar / eine Nachricht zur Bestellung.
 */
export interface CommentApiModel {
  Created: string;
  FromCustomer: boolean;
  Id: number;
  Name: string;
  Text: string;
}

/**
 * Repräsentiert einen Kunden gemäß Billbee API.
 */
export interface CustomerApiModel {
  Id: number;
  Number: number;
  Name: string;
  Email: string;
  Tel1: string;
  Tel2: string;
  Type: number;
  LanguageId: number;
  PriceGroupId: number;
  VatId?: string;
}

/**
 * Repräsentiert eine Adresse (Rechnungs-/Versandadresse).
 */
export interface OrderAddressApiModel {
  BillbeeId: number;
  Street: string;
  HouseNumber?: string;
  Line2?: string;
  NameAddition?: string;
  Zip: string;
  City: string;
  State?: string;
  Country: string;
  CountryISO2: string;
  Company?: string;
  Email?: string;
  Phone?: string;
  FirstName: string;
  LastName: string;
}

/**
 * Repräsentiert eine Position / ein Item in einer Bestellung.
 */
export interface OrderItem {
  BillbeeId: number;
  Product: SoldProduct;
  Quantity: number;
  Discount: number;
  TotalPrice: number;
  TaxAmount: number;
  TaxIndex: number;
  IsCoupon: boolean;
  GetPriceFromArticleIfAny: boolean;
  DontAdjustStock: boolean;
  Attributes: OrderItemAttribute[];
  SerialNumber?: string;
  TransactionId?: string;
  Rebate?: number;
  UnrebatedTotalPrice?: number;
}

/**
 * Attribute eines OrderItems, z.B. Farbe, Größe.
 */
export interface OrderItemAttribute {
  Id: string;
  Name: string;
  Value: string;
  Price: number;
}

/**
 * Repräsentiert ein verkauftes Produkt innerhalb einer Bestellung.
 */
export interface SoldProduct {
  Id: string;
  BillbeeId: number;
  EAN?: string;
  CountryOfOrigin?: string;
  Images?: ProductImage[];
}

/**
 * Bild eines verkauften Produkts.
 */
export interface ProductImage {
  Url: string;
  IsDefaultImage: boolean;
  Position?: number;
  ExternalId?: string;
}

/**
 * Repräsentiert eine Zahlung zu einer Bestellung.
 */
export interface OrderPayment {
  // Felder je nach Billbee API
  Id: number;
  Amount: number;
  Payer?: string;
  PaymentMethod?: number;
  CreatedAt?: string;
}

/**
 * Repräsentiert einen Shipment-Eintrag einer Bestellung.
 */
export interface Shipment {
  BillbeeId: number;
  ShippingId: string;
  Shipper: string;
  ShippingCarrier: number;
  Created: string;
}

/**
 * Zusätzliche Services für eine Lieferung.
 */
export interface ProductService {
  // Felder je nach Billbee API
  Id: number;
  Name: string;
}

/**
 * Historische Einträge einer Bestellung.
 */
export interface HistoryEntry {
  // Felder je nach Billbee API
  Date: string;
  Event: string;
  User?: string;
}

/**
 * Repräsentiert ein Produkt gemäß Billbee API.
 */
export interface ProductApiModel {
  Id: number;
  BillbeeId?: number;
  Name: string;
  ArticleNumber?: string;
  EAN?: string;
  Description?: string;
  PriceGross: number;
  PriceNet: number;
  TaxRate: number;
  IsActive: boolean;
  Stock?: number;
  StockUnlimited?: boolean;
  CreatedAt: string;
  LastModifiedAt: string;
  Images?: ProductImage[];
}

export interface Component{
  billbee_product_id: string;
  sku: string;
  name: string | null;
  stock_available: number;
  stock_committed: number;
  stock_committed_in_bom: number;  
  stock_unavailable: number;
  sold_amount: number;
  sold_amount_in_bom: number;
  manufacturer: string | null;
  category: string | null;
  updated_at: string;
}
/**
 * Repräsentiert einen Kunden gemäß Billbee API.
 * Alias zu CustomerApiModel.
 */
export type Customer = CustomerApiModel;
