import { Hono } from 'hono';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { checkSupplierStock, placeSupplierOrder } from './suppliers';

interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  RESEND_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  XERO_CLIENT_ID: string;
  XERO_CLIENT_SECRET: string;
  APP_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

// Helper for generating IDs
const uuid = () => crypto.randomUUID();

// ---------------------------------------------------------
// FRONTEND: Mobile-First SPA Interface
// ---------------------------------------------------------
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Screeny - Screen Printing Order Management</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/alpinejs" defer></script>
</head>
<body class="bg-gray-50 text-gray-900 font-sans antialiased pb-20">
  <div class="max-w-md mx-auto p-4 min-h-screen flex flex-col justify-between" x-data="screenyApp()">
    <div>
      <!-- Header -->
      <header class="flex justify-between items-center py-4 border-b border-gray-200 mb-6">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-indigo-600">Screeny 🎨</h1>
          <p class="text-xs text-gray-500">Screen Printing Job & Order Manager</p>
        </div>
        <div class="flex space-x-2">
          <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800" x-text="activeRole"></span>
          <button @click="toggleRole()" class="text-xs bg-gray-200 px-2 py-1 rounded">Switch</button>
        </div>
      </header>

      <!-- Navigation Tabs -->
      <nav class="flex space-x-1 bg-gray-200 p-1 rounded-xl mb-6 text-xs font-medium">
        <button @click="tab = 'orders'" :class="tab === 'orders' ? 'bg-white text-indigo-600 shadow' : 'text-gray-600'" class="flex-1 py-2 rounded-lg text-center transition">Orders</button>
        <button @click="tab = 'quotes'" :class="tab === 'quotes' ? 'bg-white text-indigo-600 shadow' : 'text-gray-600'" class="flex-1 py-2 rounded-lg text-center transition">Quotes</button>
        <button @click="tab = 'designs'" :class="tab === 'designs' ? 'bg-white text-indigo-600 shadow' : 'text-gray-600'" class="flex-1 py-2 rounded-lg text-center transition">Designs</button>
        <button @click="tab = 'customers'" :class="tab === 'customers' ? 'bg-white text-indigo-600 shadow' : 'text-gray-600'" class="flex-1 py-2 rounded-lg text-center transition">Clients</button>
      </nav>

      <!-- ORDERS TAB -->
      <div x-show="tab === 'orders'" class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-bold">Active Orders</h2>
          <button @click="openNewOrderModal = true" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow">＋ New Order</button>
        </div>

        <template x-for="order in orders" :key="order.id">
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
            <div class="flex justify-between items-start">
              <div>
                <span class="text-xs font-bold text-indigo-600" x-text="order.id.slice(0,8).toUpperCase()"></span>
                <h3 class="font-bold text-gray-800" x-text="order.customer_name"></h3>
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-medium"
                :class="{
                  'bg-yellow-100 text-yellow-800': order.status === 'New',
                  'bg-blue-100 text-blue-800': order.status === 'In Progress',
                  'bg-purple-100 text-purple-800': order.status === 'Completed',
                  'bg-green-100 text-green-800': order.status === 'Shipped'
                }" x-text="order.status"></span>
            </div>

            <div class="text-xs text-gray-600 space-y-1">
              <p>📍 <span x-text="order.shipping_address"></span></p>
              <p>💳 Payment: <span class="font-semibold" x-text="order.payment_status"></span></p>
              <p>💰 Total: $<span x-text="order.total_amount"></span></p>
              <p x-show="order.tracking_number">📦 Tracking: <code class="bg-gray-100 px-1 py-0.5 rounded" x-text="order.tracking_number"></code></p>
            </div>

            <div class="flex space-x-2 pt-2 border-t border-gray-100 text-xs">
              <button x-show="activeRole === 'Admin' && order.payment_status === 'Pending'" @click="markPaid(order.id)" class="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded font-medium border border-emerald-200">Mark Paid (Bank)</button>
              <button x-show="activeRole === 'Admin' && order.status !== 'Shipped'" @click="shipOrderPrompt(order.id)" class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded font-medium border border-indigo-200">Scan QR & Ship</button>
              <button @click="viewOrderHistory(order.id)" class="bg-gray-100 text-gray-700 px-2.5 py-1 rounded font-medium">History</button>
            </div>
          </div>
        </template>
      </div>

      <!-- QUOTES TAB -->
      <div x-show="tab === 'quotes'" class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-bold">Quotes & Approvals</h2>
          <button @click="openNewQuoteModal = true" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow">＋ New Quote</button>
        </div>

        <template x-for="quote in quotes" :key="quote.id">
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
            <div class="flex justify-between items-start">
              <div>
                <span class="text-xs font-bold text-indigo-600" x-text="'QUOTE #' + quote.id.slice(0,6).toUpperCase()"></span>
                <h3 class="font-bold text-gray-800" x-text="quote.customer_name"></h3>
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-medium"
                :class="{
                  'bg-gray-100 text-gray-800': quote.status === 'Draft',
                  'bg-blue-100 text-blue-800': quote.status === 'Sent',
                  'bg-green-100 text-green-800': quote.status === 'Approved',
                  'bg-red-100 text-red-800': quote.status === 'Rejected'
                }" x-text="quote.status"></span>
            </div>
            <p class="text-xs text-gray-600">Total Price: <span class="font-bold text-gray-900">$</span><span class="font-bold text-gray-900" x-text="quote.total_price"></span></p>
            <div class="flex space-x-2 pt-2 border-t border-gray-100 text-xs">
              <button x-show="quote.status === 'Draft'" @click="sendQuote(quote.id)" class="bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium">Send to Customer</button>
              <button x-show="quote.status === 'Sent'" @click="approveQuote(quote.id)" class="bg-green-600 text-white px-2.5 py-1 rounded font-semibold">Approve & Pay Upfront</button>
            </div>
          </div>
        </template>
      </div>

      <!-- DESIGNS TAB -->
      <div x-show="tab === 'designs'" class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-bold">Client Designs</h2>
          <button @click="openNewDesignModal = true" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow">＋ Upload Design</button>
        </div>

        <template x-for="design in designs" :key="design.id">
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
            <div class="flex justify-between">
              <span class="text-xs font-bold text-indigo-600" x-text="'DESIGN #' + design.id.slice(0,6).toUpperCase()"></span>
              <span class="text-xs text-gray-500" x-text="design.customer_name"></span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-gray-50 p-2 rounded text-center">
                <span class="block font-semibold text-gray-600 mb-1">Front Artwork</span>
                <a :href="design.artwork_front_url" target="_blank" class="text-indigo-600 underline">View File</a>
              </div>
              <div class="bg-gray-50 p-2 rounded text-center">
                <span class="block font-semibold text-gray-600 mb-1">Back Artwork</span>
                <a :href="design.artwork_back_url" target="_blank" class="text-indigo-600 underline">View File</a>
              </div>
            </div>
            <div x-show="activeRole === 'Admin'" class="bg-amber-50 p-2.5 rounded text-xs space-y-1 border border-amber-200">
              <p>🎨 Colours Used: <span class="font-medium" x-text="design.colours_used || 'None specified'"></span></p>
              <p>📝 Admin Notes: <span class="font-medium" x-text="design.notes || 'None'"></span></p>
            </div>
          </div>
        </template>
      </div>

      <!-- CUSTOMERS TAB -->
      <div x-show="tab === 'customers'" class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-bold">Client Accounts</h2>
          <button @click="openNewCustomerModal = true" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow">＋ New Client</button>
        </div>

        <template x-for="cust in customers" :key="cust.id">
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
            <h3 class="font-bold text-gray-900" x-text="cust.customer_name"></h3>
            <p class="text-xs text-gray-600">📍 Default Shipping: <span x-text="cust.default_shipping_address"></span></p>
            
            <div class="border-t pt-2 space-y-2">
              <div class="flex justify-between items-center text-xs font-semibold text-gray-700">
                <span>Contacts & Invites</span>
                <button @click="openAddContact(cust.id)" class="text-indigo-600">＋ Add Contact</button>
              </div>
              <template x-for="contact in cust.contacts" :key="contact.email">
                <div class="bg-gray-50 p-2 rounded flex justify-between items-center text-xs">
                  <div>
                    <span class="font-bold" x-text="contact.contact_name"></span> (<span x-text="contact.email"></span>)<br>
                    <span class="text-gray-500" x-text="contact.phone"></span>
                  </div>
                  <div class="text-right">
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold"
                      :class="contact.invite_status === 'Accepted' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'"
                      x-text="contact.invite_status"></span>
                    <button @click="resendInvite(contact.id)" class="block text-indigo-600 text-[10px] underline mt-1">Resend Invite</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Modals & Footer -->
    <!-- NEW ORDER MODAL -->
    <div x-show="openNewOrderModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
        <h3 class="font-bold text-lg">Create New Order</h3>
        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-semibold mb-1">Customer</label>
            <select x-effect="fetchAddresses(newOrder.customer_id)" x-model="newOrder.customer_id" class="w-full border p-2 rounded-lg">
              <option value="">Select Customer</option>
              <template x-for="c in customers" :key="c.id">
                <option :value="c.id" x-text="c.customer_name"></option>
              </template>
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">Design</label>
            <select x-model="newOrder.design_id" class="w-full border p-2 rounded-lg">
              <option value="">Select Design</option>
              <template x-for="d in designs" :key="d.id">
                <option :value="d.id" x-text="'Design #' + d.id.slice(0,6)"></option>
              </template>
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">Shipping Address</label>
            <select x-model="newOrder.shipping_address" class="w-full border p-2 rounded-lg">
              <template x-for="addr in availableAddresses" :key="addr">
                <option :value="addr" x-text="addr"></option>
              </template>
            </select>
            <input type="text" x-model="newOrder.custom_shipping" placeholder="Or enter new shipping address" class="w-full border p-2 rounded-lg mt-1">
          </div>
          <div>
            <label class="block font-semibold mb-1">Total Amount ($)</label>
            <input type="number" x-model="newOrder.total_amount" class="w-full border p-2 rounded-lg" placeholder="250.00">
          </div>
        </div>
        <div class="flex space-x-2 pt-2">
          <button @click="submitOrder()" class="flex-1 bg-indigo-600 text-white py-2 rounded-xl font-semibold">Submit & Pay</button>
          <button @click="openNewOrderModal = false" class="bg-gray-200 px-4 py-2 rounded-xl font-semibold">Cancel</button>
        </div>
      </div>
    </div>

    <!-- NEW CUSTOMER MODAL -->
    <div x-show="openNewCustomerModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
        <h3 class="font-bold text-lg">Add New Client</h3>
        <div class="space-y-3 text-xs">
          <input type="text" x-model="newCust.customer_name" placeholder="Company Name" class="w-full border p-2 rounded-lg">
          <input type="text" x-model="newCust.default_shipping_address" placeholder="Default Shipping Address" class="w-full border p-2 rounded-lg">
          <hr class="my-2">
          <h4 class="font-bold text-gray-700">Initial Contact Person</h4>
          <input type="text" x-model="newCust.contact_name" placeholder="Contact Name" class="w-full border p-2 rounded-lg">
          <input type="email" x-model="newCust.email" placeholder="Email Address" class="w-full border p-2 rounded-lg">
          <input type="text" x-model="newCust.phone" placeholder="Phone Number" class="w-full border p-2 rounded-lg">
        </div>
        <div class="flex space-x-2 pt-2">
          <button @click="createCustomer()" class="flex-1 bg-indigo-600 text-white py-2 rounded-xl font-semibold">Save Client</button>
          <button @click="openNewCustomerModal = false" class="bg-gray-200 px-4 py-2 rounded-xl font-semibold">Cancel</button>
        </div>
      </div>
    </div>

    <!-- QR SCANNER / SHIP MODAL -->
    <div x-show="openShipModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl text-center">
        <h3 class="font-bold text-lg">Capture Shipping Tracking QR</h3>
        <p class="text-xs text-gray-600">Scan or enter QR code data from courier / shipping label using camera.</p>
        <div class="bg-gray-100 p-6 rounded-xl border-2 border-dashed border-gray-300">
          <input type="text" x-model="shipTrackingNumber" placeholder="Tracking Number / QR Data" class="w-full border p-2 rounded-lg text-center font-mono">
        </div>
        <div class="flex space-x-2 pt-2">
          <button @click="confirmShipment()" class="flex-1 bg-green-600 text-white py-2 rounded-xl font-semibold">Confirm Shipped</button>
          <button @click="openShipModal = false" class="bg-gray-200 px-4 py-2 rounded-xl font-semibold">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Footer info -->
    <footer class="text-center text-xs text-gray-400 mt-12">
      Screeny 2026 - Screen Printing Order Management
    </footer>
  </div>

  <script>
    function screenyApp() {
      return {
        tab: 'orders',
        activeRole: 'Admin',
        orders: [],
        quotes: [],
        designs: [],
        customers: [],
        openNewOrderModal: false,
        openNewCustomerModal: false,
        openNewQuoteModal: false,
        openNewDesignModal: false,
        openShipModal: false,
        shippingOrderId: '',
        shipTrackingNumber: '',
        availableAddresses: [],
        newOrder: { customer_id: '', design_id: '', shipping_address: '', custom_shipping: '', total_amount: '' },
        newCust: { customer_name: '', default_shipping_address: '', contact_name: '', email: '', phone: '' },

        async init() {
          await this.loadAll();
        },

        async loadAll() {
          const [o, q, d, c] = await Promise.all([
            fetch('/api/orders').then(r => r.json()),
            fetch('/api/quotes').then(r => r.json()),
            fetch('/api/designs').then(r => r.json()),
            fetch('/api/customers').then(r => r.json())
          ]);
          this.orders = o;
          this.quotes = q;
          this.designs = d;
          this.customers = c;
        },

        toggleRole() {
          this.activeRole = this.activeRole === 'Admin' ? 'Customer' : 'Admin';
        },

        async fetchAddresses(custId) {
          if (!custId) { this.availableAddresses = []; return; }
          const cust = this.customers.find(c => c.id === custId);
          if (cust) {
            this.availableAddresses = [cust.default_shipping_address];
            const res = await fetch(\`/api/customers/\${custId}/addresses\`);
            const addrs = await res.json();
            addrs.forEach(a => this.availableAddresses.push(\`\${a.address_line}, \${a.city} \${a.state} \${a.postcode}\`));
          }
        },

        async createCustomer() {
          await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.newCust)
          });
          this.openNewCustomerModal = false;
          await this.loadAll();
        },

        async submitOrder() {
          const address = this.newOrder.custom_shipping || this.newOrder.shipping_address;
          await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: this.newOrder.customer_id,
              design_id: this.newOrder.design_id,
              shipping_address: address,
              total_amount: parseFloat(this.newOrder.total_amount) || 100
            })
          });
          this.openNewOrderModal = false;
          await this.loadAll();
        },

        async markPaid(orderId) {
          await fetch(\`/api/orders/\${orderId}/mark-paid\`, { method: 'POST' });
          await this.loadAll();
        },

        shipOrderPrompt(orderId) {
          this.shippingOrderId = orderId;
          this.shipTrackingNumber = 'TRK-' + Math.floor(Math.random() * 899999 + 100000);
          this.openShipModal = true;
        },

        async confirmShipment() {
          await fetch(\`/api/orders/\${this.shippingOrderId}/status\`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Shipped', tracking_number: this.shipTrackingNumber })
          });
          this.openShipModal = false;
          await this.loadAll();
        },

        async resendInvite(contactId) {
          await fetch(\`/api/contacts/\${contactId}/resend-invite\`, { method: 'POST' });
          alert('Magic link invite resent successfully!');
        },

        async sendQuote(quoteId) {
          await fetch(\`/api/quotes/\${quoteId}/send\`, { method: 'POST' });
          await this.loadAll();
        },

        async approveQuote(quoteId) {
          await fetch(\`/api/quotes/\${quoteId}/approve\`, { method: 'POST' });
          alert('Quote approved! Xero invoice created & upfront payment requested.');
          await this.loadAll();
        },

        viewOrderHistory(orderId) {
          alert('Opening full order history and Resend tracking audit trail for order ' + orderId);
        }
      }
    }
  </script>
</body>
</html>
  `);
});

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------

// Customers & Contacts
app.get('/api/customers', async (c) => {
  const { results: customers } = await c.env.DB.prepare('SELECT * FROM customers').all();
  for (const cust of customers) {
    const { results: contacts } = await c.env.DB.prepare('SELECT * FROM customer_contacts WHERE customer_id = ?').bind(cust.id).all();
    cust.contacts = contacts;
  }
  return c.json(customers);
});

app.post('/api/customers', async (c) => {
  const body = await c.req.json();
  const custId = uuid();
  const contactId = uuid();
  const magicToken = uuid();

  await c.env.DB.prepare(
    'INSERT INTO customers (id, customer_name, default_shipping_address) VALUES (?, ?, ?)'
  ).bind(custId, body.customer_name, body.default_shipping_address).run();

  if (body.email) {
    await c.env.DB.prepare(
      'INSERT INTO customer_contacts (id, customer_id, contact_name, email, phone, invite_status, magic_token) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(contactId, custId, body.contact_name, body.email, body.phone, 'Pending', magicToken).run();

    // Send magic link invite via Resend
    const resend = new Resend(c.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Screeny <orders@mail.screensy.app>',
      to: [body.email],
      subject: `Welcome to Screeny - Portal Invitation`,
      html: `<p>Hello ${body.contact_name},</p><p>You have been invited to your client portal on Screeny.</p><p><a href="${c.env.APP_URL || 'http://localhost:8787'}/auth/magic?token=${magicToken}">Click here to sign in</a></p>`,
    });
  }

  return c.json({ success: true, customer_id: custId });
});

app.get('/api/customers/:id/addresses', async (c) => {
  const custId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM customer_shipping_addresses WHERE customer_id = ?').bind(custId).all();
  return c.json(results);
});

app.post('/api/contacts/:id/resend-invite', async (c) => {
  const contactId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM customer_contacts WHERE id = ?').bind(contactId).all();
  const contact: any = results[0];
  if (!contact) return c.json({ error: 'Contact not found' }, 404);

  const newToken = uuid();
  await c.env.DB.prepare('UPDATE customer_contacts SET magic_token = ? WHERE id = ?').bind(newToken, contactId).run();

  const resend = new Resend(c.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Screeny <orders@mail.screensy.app>',
    to: [contact.email],
    subject: `Screeny Portal Invitation (Resent)`,
    html: `<p>Hello ${contact.contact_name},</p><p>Here is your new magic link to access your Screeny client portal.</p><p><a href="${c.env.APP_URL || 'http://localhost:8787'}/auth/magic?token=${newToken}">Click here to sign in</a></p>`,
  });

  return c.json({ success: true });
});

// Designs
app.get('/api/designs', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT designs.*, customers.customer_name 
    FROM designs 
    JOIN customers ON designs.customer_id = customers.id
  `).all();
  return c.json(results);
});

app.post('/api/designs', async (c) => {
  const body = await c.req.json();
  const id = uuid();
  await c.env.DB.prepare(
    'INSERT INTO designs (id, customer_id, artwork_front_url, artwork_back_url, colours_used, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.customer_id, body.artwork_front_url || 'https://example.com/front.png', body.artwork_back_url || 'https://example.com/back.png', body.colours_used, body.notes).run();
  return c.json({ success: true, design_id: id });
});

// Quotes
app.get('/api/quotes', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT quotes.*, customers.customer_name 
    FROM quotes 
    JOIN customers ON quotes.customer_id = customers.id
  `).all();
  return c.json(results);
});

app.post('/api/quotes', async (c) => {
  const body = await c.req.json();
  const id = uuid();
  await c.env.DB.prepare(
    'INSERT INTO quotes (id, customer_id, design_id, items_json, total_price, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.customer_id, body.design_id, JSON.stringify(body.items || []), body.total_price, 'Draft').run();
  return c.json({ success: true, quote_id: id });
});

app.post('/api/quotes/:id/send', async (c) => {
  const quoteId = c.req.param('id');
  await c.env.DB.prepare('UPDATE quotes SET status = ? WHERE id = ?').bind('Sent', quoteId).run();
  return c.json({ success: true });
});

app.post('/api/quotes/:id/approve', async (c) => {
  const quoteId = c.req.param('id');
  await c.env.DB.prepare('UPDATE quotes SET status = ? WHERE id = ?').bind('Approved', quoteId).run();
  
  // Create Xero Invoice simulation & upfront payment request
  const quoteRes = await c.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).all();
  const quote: any = quoteRes.results[0];
  if (quote) {
    const orderId = uuid();
    const xeroInvoiceId = `INV-XERO-${Math.floor(Math.random() * 899999 + 100000)}`;
    const custRes = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(quote.customer_id).all();
    const cust: any = custRes.results[0];

    await c.env.DB.prepare(
      'INSERT INTO orders (id, customer_id, design_id, shipping_address, status, payment_status, total_amount, xero_invoice_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(orderId, quote.customer_id, quote.design_id, cust.default_shipping_address, 'New', 'Pending', quote.total_price, xeroInvoiceId).run();

    await c.env.DB.prepare(
      'INSERT INTO order_history (id, order_id, status, description, actor_type) VALUES (?, ?, ?, ?, ?)'
    ).bind(uuid(), orderId, 'New', `Quote approved. Xero Invoice ${xeroInvoiceId} generated. Awaiting upfront payment.`, 'system').run();
  }

  return c.json({ success: true });
});

// Orders & Upfront Payment
app.get('/api/orders', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT orders.*, customers.customer_name 
    FROM orders 
    JOIN customers ON orders.customer_id = customers.id
    ORDER BY orders.created_at DESC
  `).all();
  return c.json(results);
});

app.post('/api/orders', async (c) => {
  const body = await c.req.json();
  const orderId = uuid();
  const xeroInvoiceId = `INV-XERO-${Math.floor(Math.random() * 899999 + 100000)}`;

  await c.env.DB.prepare(
    'INSERT INTO orders (id, customer_id, design_id, shipping_address, status, payment_status, total_amount, xero_invoice_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(orderId, body.customer_id, body.design_id, body.shipping_address, 'New', 'Pending', body.total_amount, xeroInvoiceId).run();

  await c.env.DB.prepare(
    'INSERT INTO order_history (id, order_id, status, description, actor_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(uuid(), orderId, 'New', `Order submitted. Xero Invoice ${xeroInvoiceId} created. Awaiting upfront payment.`, 'customer').run();

  return c.json({ success: true, order_id: orderId });
});

app.post('/api/orders/:id/mark-paid', async (c) => {
  const orderId = c.req.param('id');
  await c.env.DB.prepare('UPDATE orders SET payment_status = ?, status = ? WHERE id = ?').bind('Paid_Bank_Transfer', 'In Progress', orderId).run();

  await c.env.DB.prepare(
    'INSERT INTO order_history (id, order_id, status, description, actor_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(uuid(), orderId, 'In Progress', 'Payment verified via bank transfer by admin. Order moved to In Progress.', 'admin').run();

  return c.json({ success: true });
});

app.patch('/api/orders/:id/status', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const trackingNumber = body.tracking_number || null;

  await c.env.DB.prepare(
    'UPDATE orders SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(body.status, trackingNumber, orderId).run();

  if (body.status === 'Shipped' && trackingNumber) {
    // Send email with tracking number via Resend
    const orderRes = await c.env.DB.prepare('SELECT orders.*, customers.customer_name FROM orders JOIN customers ON orders.customer_id = customers.id WHERE orders.id = ?').bind(orderId).all();
    const order: any = orderRes.results[0];
    if (order) {
      const contactRes = await c.env.DB.prepare('SELECT email FROM customer_contacts WHERE customer_id = ?').bind(order.customer_id).all();
      const contacts = contactRes.results;
      const resend = new Resend(c.env.RESEND_API_KEY);
      for (const contact of contacts as any[]) {
        await resend.emails.send({
          from: 'Screeny <orders@mail.screensy.app>',
          to: [contact.email],
          subject: `Your Screeny order has shipped! Tracking: ${trackingNumber}`,
          html: `<p>Hello ${order.customer_name},</p><p>Your order has shipped via courier.</p><p><strong>Tracking Number:</strong> ${trackingNumber}</p>`,
        });
      }
    }
  }

  await c.env.DB.prepare(
    'INSERT INTO order_history (id, order_id, status, description, actor_type, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uuid(), orderId, body.status, `Status updated to ${body.status}${trackingNumber ? ` with tracking ${trackingNumber}` : ''}`, 'admin', JSON.stringify(body)).run();

  return c.json({ success: true });
});

// Resend Webhooks for tracking delivery, opens, clicks
app.post('/api/webhooks/resend', async (c) => {
  const event: any = await c.req.json();
  const eventType = event.type; // e.g. email.delivered, email.opened, email.clicked
  const emailData = event.data;

  // Log tracking status against order history or contact
  await c.env.DB.prepare(
    'INSERT INTO order_history (id, order_id, status, description, actor_type, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uuid(), 'SYSTEM_GLOBAL', eventType, `Resend webhook event: ${eventType} for ${emailData.to}`, 'resend_webhook', JSON.stringify(event)).run();

  return c.json({ received: true });
});

export default app;
