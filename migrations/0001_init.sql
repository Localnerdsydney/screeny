CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  default_shipping_address TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  invite_status TEXT DEFAULT 'Pending', -- Pending, Accepted, Expired
  magic_token TEXT,
  token_expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS customer_shipping_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postcode TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  artwork_front_url TEXT,
  artwork_back_url TEXT,
  colours_used TEXT, -- Admin only
  notes TEXT, -- Admin only
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  design_id TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total_price REAL NOT NULL,
  status TEXT DEFAULT 'Draft', -- Draft, Sent, Approved, Rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (design_id) REFERENCES designs(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  design_id TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  status TEXT DEFAULT 'New', -- New, In Progress, Completed, Shipped
  payment_status TEXT DEFAULT 'Pending', -- Pending, Paid_Stripe, Paid_Bank_Transfer
  tracking_number TEXT,
  shipping_qr_data TEXT,
  total_amount REAL NOT NULL,
  xero_invoice_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (design_id) REFERENCES designs(id)
);

CREATE TABLE IF NOT EXISTS order_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_type TEXT NOT NULL, -- admin, customer, system, resend_webhook
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS supplier_catalog (
  id TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL, -- AS Colour, Gildan, Ramo
  style_code TEXT NOT NULL,
  style_name TEXT NOT NULL,
  colors_json TEXT NOT NULL,
  sizes_json TEXT NOT NULL,
  stock_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
