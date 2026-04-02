"""
Pydantic Models for Lebanese Accounting System
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal

# ================== USER MODELS ==================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal['super_admin', 'admin', 'accountant', 'viewer', 'cashier'] = 'viewer'
    organization_id: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal['super_admin', 'admin', 'accountant', 'viewer', 'cashier']] = None
    organization_id: Optional[str] = None
    is_active: Optional[bool] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    organization_id: Optional[str] = None
    is_active: bool = True
    created_at: str

class UserListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
    is_active: bool = True
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

# ================== ORGANIZATION MODELS ==================

class OrganizationCreate(BaseModel):
    name: str
    currency: Literal['LBP', 'USD'] = 'LBP'
    base_exchange_rate: float = 89500.0
    tax_percent: float = 11.0
    tax_name: str = 'VAT'
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    registration_number: Optional[str] = None
    enable_expiry_tracking: bool = False
    pos_quick_items_enabled: bool = True  # Show quick items panel in POS
    pos_quick_items: Optional[List[str]] = None  # List of item IDs for quick items

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[Literal['LBP', 'USD']] = None
    base_exchange_rate: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    registration_number: Optional[str] = None
    enable_expiry_tracking: Optional[bool] = None
    pos_quick_items_enabled: Optional[bool] = None  # Show quick items panel in POS
    pos_quick_items: Optional[List[str]] = None  # List of item IDs for quick items
    # Invoice template - stored as dict to allow flexible structure (legacy, also serves as default)
    invoice_template: Optional[dict] = None
    # Document-specific templates: {sales_invoice: {...}, purchase_invoice: {...}, sales_quotation: {...}}
    document_templates: Optional[dict] = None
    # Invoice/Document Series Settings
    invoice_series: Optional[dict] = None  # {prefix: "INV-", next_number: 1, year_format: true}

class OrganizationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    currency: str
    base_exchange_rate: float
    tax_percent: Optional[float] = 11.0
    tax_name: Optional[str] = 'VAT'
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    registration_number: Optional[str] = None
    enable_expiry_tracking: Optional[bool] = False
    pos_quick_items_enabled: Optional[bool] = True  # Show quick items panel in POS
    pos_quick_items: Optional[List[str]] = None  # List of item IDs for quick items
    invoice_template: Optional[dict] = None  # Legacy/default template
    document_templates: Optional[dict] = None  # Document-specific templates
    invoice_series: Optional[dict] = None  # Invoice/Document Series Settings
    created_at: str

# ================== ACCOUNT MODELS ==================

class AccountCreate(BaseModel):
    code: str
    name: str
    name_ar: Optional[str] = None
    account_class: int = Field(ge=1, le=7)
    account_type: Literal['asset', 'liability', 'equity', 'revenue', 'expense']
    parent_code: Optional[str] = None
    is_active: bool = True
    organization_id: str
    mobile: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    vat_number: Optional[str] = None

class AccountResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str
    name: str
    name_ar: Optional[str] = None
    account_class: Optional[int] = None  # Optional for legacy data - auto-detect from code
    account_type: Optional[str] = None  # Optional for legacy data
    parent_code: Optional[str] = None
    is_active: bool = True  # Default to active
    organization_id: str
    balance_lbp: float = 0
    balance_usd: float = 0
    mobile: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    vat_number: Optional[str] = None
    registration_number: Optional[str] = None
    created_at: Optional[str] = None  # Allow created_at field

class ContactInfoUpdate(BaseModel):
    mobile: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    vat_number: Optional[str] = None

# ================== INVENTORY MODELS ==================

class InventoryCategoryCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    description: Optional[str] = None
    organization_id: str

class InventoryCategoryUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    description: Optional[str] = None

class InventoryCategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cat_id: Optional[str] = None
    name: str
    name_ar: Optional[str] = None
    description: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None

class InventoryItemCreate(BaseModel):
    barcode: Optional[str] = None
    sku: Optional[str] = None
    moh_code: Optional[str] = None  # Ministry of Health code
    name: str
    name_ar: Optional[str] = None
    category: Optional[str] = None  # Category name (text)
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    cost: float = 0
    price: float = 0
    currency: str = 'USD'
    min_qty: float = 0
    on_hand_qty: float = 0
    unit: str = 'piece'
    expiry_date: Optional[str] = None
    description: Optional[str] = None
    image_filename: Optional[str] = None
    is_taxable: bool = True
    is_active: bool = True
    is_pos_item: bool = False  # Show in POS Quick Items
    show_image_in_pos: bool = True  # Display image in POS Quick Items
    country_of_origin: Optional[str] = None  # Country of origin/origine
    discount_percent: float = 0  # Default discount percentage
    package: Optional[float] = None
    pack_description: Optional[str] = None
    organization_id: str

class InventoryItemUpdate(BaseModel):
    barcode: Optional[str] = None
    sku: Optional[str] = None
    moh_code: Optional[str] = None  # Ministry of Health code
    name: Optional[str] = None
    name_ar: Optional[str] = None
    category: Optional[str] = None  # Category name (text)
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    cost: Optional[float] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    min_qty: Optional[float] = None
    on_hand_qty: Optional[float] = None
    unit: Optional[str] = None
    expiry_date: Optional[str] = None
    description: Optional[str] = None
    image_filename: Optional[str] = None
    is_taxable: Optional[bool] = None
    is_active: Optional[bool] = None
    is_pos_item: Optional[bool] = None  # Show in POS Quick Items
    show_image_in_pos: Optional[bool] = None  # Display image in POS Quick Items
    country_of_origin: Optional[str] = None  # Country of origin/origine
    discount_percent: Optional[float] = None  # Default discount percentage
    package: Optional[float] = None
    pack_description: Optional[str] = None

# Batch/Lot model for inventory items with expiry tracking
class InventoryBatch(BaseModel):
    batch_number: str
    expiry_date: Optional[str] = None
    quantity: float = 0
    cost: Optional[float] = None  # Cost per unit for this batch
    received_date: Optional[str] = None
    notes: Optional[str] = None

class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    barcode: Optional[str] = None
    sku: Optional[str] = None
    moh_code: Optional[str] = None  # Ministry of Health code
    name: str
    name_ar: Optional[str] = None
    category: Optional[str] = None  # Category name (text)
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    cost: float
    price: float
    currency: str
    min_qty: float
    on_hand_qty: float
    unit: str
    expiry_date: Optional[str] = None  # Legacy field for simple mode
    batches: Optional[List[dict]] = None  # For expiry tracking mode
    description: Optional[str] = None
    image_filename: Optional[str] = None
    image_url: Optional[str] = None  # S3 URL for the image
    image_s3_key: Optional[str] = None  # S3 object key
    is_taxable: Optional[bool] = True
    is_active: bool
    is_pos_item: Optional[bool] = False  # Show in POS Quick Items
    show_image_in_pos: Optional[bool] = True  # Display image in POS Quick Items
    country_of_origin: Optional[str] = None  # Country of origin/origine
    discount_percent: Optional[float] = 0  # Default discount percentage
    package: Optional[float] = None
    pack_description: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None

# ================== SERVICE ITEM MODELS (Non-stock items) ==================

class ServiceItemCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    description: Optional[str] = None
    price: float = 0
    currency: str = 'USD'
    unit: str = 'service'
    is_taxable: bool = True
    organization_id: str
    image_url: Optional[str] = None  # S3 URL for the image
    image_s3_key: Optional[str] = None  # S3 object key

class ServiceItemUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    unit: Optional[str] = None
    is_taxable: Optional[bool] = None
    image_url: Optional[str] = None
    image_s3_key: Optional[str] = None

class ServiceItemResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_ar: Optional[str] = None
    description: Optional[str] = None
    price: float
    currency: str
    unit: str
    is_taxable: bool
    organization_id: str
    image_url: Optional[str] = None
    image_s3_key: Optional[str] = None
    created_at: str

# ================== SALES INVOICE MODELS ==================

class UsedInventoryItem(BaseModel):
    inventory_item_id: str
    item_name: str
    quantity: float = 1

class SalesInvoiceLineItem(BaseModel):
    inventory_item_id: Optional[str] = None
    item_name: str
    item_name_ar: Optional[str] = None
    barcode: Optional[str] = None
    box: Optional[float] = None
    package: Optional[float] = None
    pack_description: Optional[str] = None
    quantity: float
    unit: str = 'piece'
    unit_price: float
    currency: str = 'USD'
    exchange_rate: float = 1
    discount_percent: float = 0
    line_total: float
    line_total_usd: Optional[float] = None
    is_taxable: bool = True
    used_items: Optional[List[UsedInventoryItem]] = None
    batch_id: Optional[str] = None  # For batch-specific sales
    image_url: Optional[str] = None  # Item/service image for print
    type: Optional[str] = None  # 'item' or 'service'

class SalesInvoiceCreate(BaseModel):
    date: str
    due_date: Optional[str] = None
    lines: List[SalesInvoiceLineItem]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    notes: Optional[str] = None
    debit_account_id: str
    credit_account_id: str
    organization_id: str

class SalesInvoiceUpdate(BaseModel):
    date: Optional[str] = None
    due_date: Optional[str] = None
    lines: Optional[List[SalesInvoiceLineItem]] = None
    subtotal: Optional[float] = None
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    total: Optional[float] = None
    total_usd: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: Optional[str] = None
    credit_account_id: Optional[str] = None

class SalesInvoiceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoice_number: str
    date: str
    due_date: Optional[str] = None
    lines: List[dict]
    subtotal: float
    discount_percent: float
    discount_amount: float
    tax_percent: float
    tax_amount: float
    total: float
    total_usd: float
    currency: str = 'USD'
    notes: Optional[str] = None
    debit_account_id: str
    debit_account_code: Optional[str] = None
    debit_account_name: Optional[str] = None
    customer_address: Optional[str] = None
    customer_registration_number: Optional[str] = None
    customer_balance_usd: Optional[float] = None
    customer_vat_balance_usd: Optional[float] = None
    credit_account_id: str
    credit_account_code: Optional[str] = None
    credit_account_name: Optional[str] = None
    status: str
    is_posted: bool
    voucher_id: Optional[str] = None
    voucher_number: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None
    posted_at: Optional[str] = None
    posted_by: Optional[str] = None

# ================== SALES QUOTATION MODELS ==================

class SalesQuotationCreate(BaseModel):
    date: str
    valid_until: Optional[str] = None
    lines: List[SalesInvoiceLineItem]  # Reuse same line item structure
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    notes: Optional[str] = None
    terms: Optional[str] = None  # Terms and conditions
    debit_account_id: str  # Customer account
    organization_id: str

class SalesQuotationUpdate(BaseModel):
    date: Optional[str] = None
    valid_until: Optional[str] = None
    lines: Optional[List[SalesInvoiceLineItem]] = None
    subtotal: Optional[float] = None
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    total: Optional[float] = None
    total_usd: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    debit_account_id: Optional[str] = None
    status: Optional[str] = None

class SalesQuotationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    quotation_number: str
    date: str
    valid_until: Optional[str] = None
    lines: List[dict]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    notes: Optional[str] = None
    terms: Optional[str] = None
    debit_account_id: str
    debit_account_code: Optional[str] = None
    debit_account_name: Optional[str] = None
    status: str  # draft, sent, accepted, rejected, expired, converted
    converted_to_invoice_id: Optional[str] = None
    converted_to_invoice_number: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None
    created_by: Optional[str] = None

# ================== PURCHASE INVOICE MODELS ==================

class PurchaseInvoiceLineItem(BaseModel):
    inventory_item_id: Optional[str] = None
    item_name: str
    item_name_ar: Optional[str] = None
    barcode: Optional[str] = None
    quantity: float
    unit: str = 'piece'
    unit_price: float
    selling_price: Optional[float] = None
    currency: str = 'USD'
    exchange_rate: float = 1
    discount_percent: float = 0
    line_total: float
    line_total_usd: Optional[float] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None

class PurchaseInvoiceCreate(BaseModel):
    date: str
    due_date: Optional[str] = None
    supplier_invoice_number: Optional[str] = None
    lines: List[PurchaseInvoiceLineItem]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    notes: Optional[str] = None
    debit_account_id: str
    credit_account_id: str
    organization_id: str

class PurchaseInvoiceUpdate(BaseModel):
    date: Optional[str] = None
    due_date: Optional[str] = None
    supplier_invoice_number: Optional[str] = None
    lines: Optional[List[PurchaseInvoiceLineItem]] = None
    subtotal: Optional[float] = None
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    total: Optional[float] = None
    total_usd: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: Optional[str] = None
    credit_account_id: Optional[str] = None

class PurchaseInvoiceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoice_number: str
    supplier_invoice_number: Optional[str] = None
    date: str
    due_date: Optional[str] = None
    lines: List[dict]
    subtotal: float
    discount_percent: float
    discount_amount: float
    tax_percent: float
    tax_amount: float
    total: float
    total_usd: float
    currency: str = 'USD'
    notes: Optional[str] = None
    debit_account_id: str
    debit_account_code: Optional[str] = None
    debit_account_name: Optional[str] = None
    credit_account_id: str
    credit_account_code: Optional[str] = None
    credit_account_name: Optional[str] = None
    status: str
    is_posted: bool
    voucher_id: Optional[str] = None
    voucher_number: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None
    posted_at: Optional[str] = None
    posted_by: Optional[str] = None

# ================== POS MODELS ==================

class POSLineItem(BaseModel):
    inventory_item_id: Optional[str] = None
    item_name: str
    item_name_ar: Optional[str] = None
    barcode: Optional[str] = None
    quantity: float
    unit: str = 'piece'
    unit_price: float
    currency: str = 'USD'
    exchange_rate: float = 1
    discount_percent: float = 0
    line_total: float
    line_total_usd: Optional[float] = None
    batch_id: Optional[str] = None  # For batch-specific sales

class POSTransactionCreate(BaseModel):
    lines: List[POSLineItem]
    subtotal_usd: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total_usd: float
    total_lbp: Optional[float] = None
    payment_method: str = 'cash'
    payment_amount: float = 0
    payment_currency: str = 'USD'
    payment_exchange_rate: float = 1
    change_amount: float = 0
    payment_adjustment: float = 0  # Discount (+) or Premium (-) based on payment amount
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_code: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: str
    credit_account_id: str
    lbp_rate: float = 89500
    organization_id: str

class POSTransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    receipt_number: str
    date: str
    time: str
    lines: List[dict]
    subtotal_usd: float
    discount_percent: float
    discount_amount: float
    tax_percent: float
    tax_amount: float
    total_usd: float
    total_lbp: Optional[float] = None
    payment_method: str
    payment_amount: float
    payment_currency: str
    payment_exchange_rate: float
    change_amount: float
    payment_adjustment: Optional[float] = 0  # Discount (+) or Premium (-) based on payment amount
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_code: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: str
    debit_account_code: Optional[str] = None
    debit_account_name: Optional[str] = None
    credit_account_id: str
    credit_account_code: Optional[str] = None
    credit_account_name: Optional[str] = None
    voucher_id: Optional[str] = None
    voucher_number: Optional[str] = None
    organization_id: str
    created_at: str
    created_by: Optional[str] = None
    cashier_name: Optional[str] = None
    # Void fields for soft-delete functionality
    is_voided: Optional[bool] = False
    voided_at: Optional[str] = None
    voided_by: Optional[str] = None
    voided_by_name: Optional[str] = None
    void_reason: Optional[str] = None

# ================== CURRENCY MODELS ==================

class CurrencyCreate(BaseModel):
    code: str
    name: str
    symbol: str
    rate_to_usd: float
    rate_to_lbp: float
    is_active: bool = True

class CurrencyUpdate(BaseModel):
    name: Optional[str] = None
    symbol: Optional[str] = None
    rate_to_usd: Optional[float] = None
    rate_to_lbp: Optional[float] = None
    is_active: Optional[bool] = None

class CurrencyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    code: str
    name: str
    symbol: str
    rate_to_usd: float
    rate_to_lbp: float
    is_active: bool
    created_at: str
    updated_at: Optional[str] = None

# ================== VOUCHER MODELS ==================

class VoucherLine(BaseModel):
    account_code: str
    account_name: Optional[str] = None
    description: Optional[str] = None
    currency: str = 'USD'
    exchange_rate: float = 1.0
    debit: float = 0
    credit: float = 0
    debit_lbp: float = 0
    credit_lbp: float = 0
    debit_usd: float = 0
    credit_usd: float = 0

class VoucherCreate(BaseModel):
    voucher_type: Literal['JV', 'RV', 'PV', 'SV', 'PAYV', 'DC']
    date: str
    reference: Optional[str] = None
    description: str
    lines: List[VoucherLine]
    organization_id: str

class VoucherResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    voucher_number: str
    voucher_type: Optional[str] = 'JV'
    date: str
    reference: Optional[str] = None
    description: str
    lines: List[VoucherLine]
    total_debit_lbp: Optional[float] = 0
    total_credit_lbp: Optional[float] = 0
    total_debit_usd: Optional[float] = 0
    total_credit_usd: Optional[float] = 0
    is_posted: bool = False
    status: Optional[str] = 'draft'
    organization_id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    posted_at: Optional[str] = None
    posted_by: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class VoucherUpdate(BaseModel):
    voucher_type: Optional[str] = None
    date: Optional[str] = None
    reference: Optional[str] = None
    description: Optional[str] = None
    lines: Optional[List[VoucherLine]] = None

# ================== EXCHANGE RATE MODELS ==================

class ExchangeRateCreate(BaseModel):
    date: str
    from_currency: Optional[str] = 'USD'
    to_currency: Optional[str] = 'LBP'
    rate: float
    source: Literal['manual', 'api'] = 'manual'
    organization_id: str

class ExchangeRateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    from_currency: Optional[str] = 'USD'
    to_currency: Optional[str] = 'LBP'
    rate: float
    source: Optional[str] = 'manual'
    organization_id: str
    created_at: Optional[str] = None
    created_by: Optional[str] = None

# ================== IMAGE ARCHIVE MODELS ==================

class ImageArchiveResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    filename: str
    original_filename: str
    content_type: str
    size: int
    description: Optional[str] = None
    tags: List[str] = []
    organization_id: str
    uploaded_by: str
    created_at: str

# ================== CR/DB NOTE MODELS ==================

class CrDbNoteCreate(BaseModel):
    note_type: Literal['credit', 'debit']
    date: str
    account_id: str
    amount_usd: float
    amount_lbp: float
    reason: str
    reference: Optional[str] = None
    organization_id: str

class CrDbNoteResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    note_number: str
    note_type: str
    date: str
    account_id: str
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    amount_usd: float
    amount_lbp: float
    reason: str
    reference: Optional[str] = None
    status: str
    is_posted: bool
    voucher_id: Optional[str] = None
    voucher_number: Optional[str] = None
    attachments: List[dict] = []
    organization_id: str
    created_by: str
    created_at: str
    posted_at: Optional[str] = None
    posted_by: Optional[str] = None

# ================== BACKUP MODELS ==================

class BackupResponse(BaseModel):
    filename: str
    size: int
    collections: List[str]
    document_counts: dict
    created_at: str

class RestoreResponse(BaseModel):
    restored_collections: List[str]
    document_counts: dict
    restored_at: str

# ================== CSV IMPORT MODELS ==================

class CSVPreviewRow(BaseModel):
    row_number: int
    code: str
    name: str
    name_ar: Optional[str] = None
    account_class: int
    account_type: str
    parent_code: Optional[str] = None
    status: str
    error: Optional[str] = None

class CSVPreviewResponse(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    preview: List[CSVPreviewRow]
    headers_found: List[str]

class CSVImportResult(BaseModel):
    success: bool
    imported_count: int
    error_count: int
    errors: List[str]


# ================== FISCAL YEAR MODELS ==================

class FiscalYearCreate(BaseModel):
    name: str  # e.g., "FY 2024", "FY 2024-2025"
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    organization_id: str

class FiscalYearUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class FiscalYearResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    start_date: str
    end_date: str
    status: str  # 'open', 'closed'
    organization_id: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    closing_voucher_id: Optional[str] = None
    created_at: str

class FiscalYearCloseResponse(BaseModel):
    message: str
    fiscal_year_id: str
    closing_voucher_id: Optional[str] = None
    net_income_lbp: float = 0
    net_income_usd: float = 0
    revenue_total_lbp: float = 0
    revenue_total_usd: float = 0
    expense_total_lbp: float = 0
    expense_total_usd: float = 0



# ================== SALES RETURN MODELS ==================

class SalesReturnLineItem(BaseModel):
    inventory_item_id: Optional[str] = None
    item_name: str
    item_name_ar: Optional[str] = None
    barcode: Optional[str] = None
    box: Optional[float] = None
    package: Optional[float] = None
    pack_description: Optional[str] = None
    quantity: float
    unit: str = 'piece'
    unit_price: float
    currency: str = 'USD'
    exchange_rate: float = 1
    discount_percent: float = 0
    line_total: float
    line_total_usd: Optional[float] = None
    is_taxable: bool = True
    batch_id: Optional[str] = None

class SalesReturnCreate(BaseModel):
    date: str
    lines: List[SalesReturnLineItem]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    reason: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: str   # Sales Return account (credit side in accounting)
    credit_account_id: str  # Customer account (debit side - reduce receivable)
    organization_id: str

class SalesReturnUpdate(BaseModel):
    date: Optional[str] = None
    lines: Optional[List[SalesReturnLineItem]] = None
    subtotal: Optional[float] = None
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    total: Optional[float] = None
    total_usd: Optional[float] = None
    currency: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: Optional[str] = None
    credit_account_id: Optional[str] = None

class SalesReturnResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    return_number: str
    date: str
    lines: List[dict]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    reason: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: str
    debit_account_code: Optional[str] = None
    debit_account_name: Optional[str] = None
    credit_account_id: str
    credit_account_code: Optional[str] = None
    credit_account_name: Optional[str] = None
    customer_address: Optional[str] = None
    customer_registration_number: Optional[str] = None
    customer_balance_usd: Optional[float] = None
    customer_vat_balance_usd: Optional[float] = None
    status: str = 'draft'
    is_posted: bool = False
    voucher_id: Optional[str] = None
    voucher_number: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None
    posted_at: Optional[str] = None
    posted_by: Optional[str] = None
    created_by: Optional[str] = None


# ================== PURCHASE RETURN MODELS ==================

class PurchaseReturnLineItem(BaseModel):
    inventory_item_id: Optional[str] = None
    item_name: str
    item_name_ar: Optional[str] = None
    barcode: Optional[str] = None
    quantity: float
    unit: str = 'piece'
    unit_price: float
    currency: str = 'USD'
    exchange_rate: float = 1
    discount_percent: float = 0
    line_total: float
    line_total_usd: Optional[float] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None

class PurchaseReturnCreate(BaseModel):
    date: str
    lines: List[PurchaseReturnLineItem]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    reason: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: str   # Supplier account (reduce payable)
    credit_account_id: str  # Purchase Return account
    organization_id: str

class PurchaseReturnUpdate(BaseModel):
    date: Optional[str] = None
    lines: Optional[List[PurchaseReturnLineItem]] = None
    subtotal: Optional[float] = None
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    total: Optional[float] = None
    total_usd: Optional[float] = None
    currency: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: Optional[str] = None
    credit_account_id: Optional[str] = None

class PurchaseReturnResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    return_number: str
    date: str
    lines: List[dict]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    reason: Optional[str] = None
    notes: Optional[str] = None
    debit_account_id: str
    debit_account_code: Optional[str] = None
    debit_account_name: Optional[str] = None
    credit_account_id: str
    credit_account_code: Optional[str] = None
    credit_account_name: Optional[str] = None
    status: str = 'draft'
    is_posted: bool = False
    voucher_id: Optional[str] = None
    voucher_number: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None
    posted_at: Optional[str] = None
    posted_by: Optional[str] = None
    created_by: Optional[str] = None


# ================== PURCHASE ORDER MODELS ==================

class PurchaseOrderLineItem(BaseModel):
    inventory_item_id: Optional[str] = None
    item_name: str
    item_name_ar: Optional[str] = None
    barcode: Optional[str] = None
    quantity: float
    unit: str = 'piece'
    unit_price: float = 0
    selling_price: Optional[float] = None
    currency: str = 'USD'
    exchange_rate: float = 1
    discount_percent: float = 0
    line_total: float = 0
    line_total_usd: Optional[float] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    is_taxable: bool = True
    notes: Optional[str] = None

class PurchaseOrderCreate(BaseModel):
    date: str
    expected_delivery_date: Optional[str] = None
    order_type: str = 'supplier'  # supplier | daily_sales
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None
    lines: List[PurchaseOrderLineItem]
    subtotal: float = 0
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float = 0
    total_usd: float = 0
    currency: str = 'USD'
    notes: Optional[str] = None
    organization_id: str

class PurchaseOrderUpdate(BaseModel):
    date: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    order_type: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None
    lines: Optional[List[PurchaseOrderLineItem]] = None
    subtotal: Optional[float] = None
    discount_percent: Optional[float] = None
    discount_amount: Optional[float] = None
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    total: Optional[float] = None
    total_usd: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None

class PurchaseOrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: str
    date: str
    expected_delivery_date: Optional[str] = None
    order_type: str = 'supplier'
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None
    lines: List[dict]
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    tax_percent: float = 0
    tax_amount: float = 0
    total: float
    total_usd: float
    currency: str = 'USD'
    notes: Optional[str] = None
    status: str  # draft, approved, sent, received, posted
    purchase_invoice_id: Optional[str] = None
    purchase_invoice_number: Optional[str] = None
    organization_id: str
    created_at: str
    updated_at: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    approved_at: Optional[str] = None
    approved_by: Optional[str] = None
    sent_at: Optional[str] = None
    received_at: Optional[str] = None
    posted_at: Optional[str] = None
