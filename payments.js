// ───────────────────────────────────────────────────────────────
//  Payment plans + payment provider
//
//  PAYMENT_MODE=demo  (default) → no real money is taken. A "Simulate
//                     payment" button activates the subscription so you
//                     can test the whole flow.
//
//  To take real money later, sign up at https://business.notchpay.co
//  (MTN MoMo, Orange Money, Visa/Mastercard, withdrawals to MoMo),
//  get your API keys, and connect them in startCheckout() below.
// ───────────────────────────────────────────────────────────────

const PLANS = {
  monthly: { id: 'monthly', name: 'Monthly', price: 2,   currency: 'USD', days: 30,  methods: ['card', 'paypal'], label: '$2',      per: 'month' },
  yearly:  { id: 'yearly',  name: 'Yearly',  price: 12,  currency: 'USD', days: 365, methods: ['card', 'paypal'], label: '$12',     per: 'year', badge: 'Save 50%' },
  momo:    { id: 'momo',    name: 'Mobile Money', price: 500, currency: 'XAF', days: 30, methods: ['mtn', 'orange'], label: '500 CFA', per: 'month', badge: 'MTN & Orange' },
};

const METHODS = {
  mtn:    { id: 'mtn',    name: 'MTN Mobile Money', needsPhone: true },
  orange: { id: 'orange', name: 'Orange Money',     needsPhone: true },
  card:   { id: 'card',   name: 'Visa / Mastercard', needsPhone: false },
  paypal: { id: 'paypal', name: 'PayPal',           needsPhone: false },
};

const MODE = process.env.PAYMENT_MODE || 'demo';

// Called when a reader clicks "Pay". Returns what the browser should do next.
async function startCheckout(payment) {
  if (MODE === 'demo') {
    return { mode: 'demo', reference: payment.reference };
  }
  // ── Real provider goes here (e.g. NotchPay) ──
  // 1. Call the provider's "initialize payment" API with
  //    amount = payment.amount, currency = payment.currency,
  //    reference = payment.reference, callback = <your site>/api/payments/callback
  // 2. Return { mode: 'redirect', url: <provider checkout url> }
  // 3. In the callback / webhook, verify the payment and call activate().
  throw new Error('Real payments are not connected yet. Set PAYMENT_MODE=demo.');
}

module.exports = { PLANS, METHODS, MODE, startCheckout };
