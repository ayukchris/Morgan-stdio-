# Morgan.stdio — Comic Website

## Run it
```
npm install
npm start
```
Then open http://localhost:3000

## Admin
- Log in at `/login` with the admin email + password (set on first start).
- Dashboard: `/admin` → upload PDFs, create comics, mark chapters Free / Advertise,
  see subscribers & payments, give manual access (+30 days / +1 year).
- Change the admin password any time in **My Account**.

Optional settings (environment variables):
| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_EMAIL` | ayukchris8@gmail.com | Admin login email (used on first start) |
| `ADMIN_PASSWORD` | (required) | Admin password, used on first start to create the admin |
| `PORT` | 3000 | Web port |
| `PAYMENT_MODE` | demo | `demo` = test payments only |

## Plans (edit in `payments.js`)
- Monthly: $2 (card / PayPal)
- Yearly: $12 (card / PayPal)
- Mobile Money: 500 CFA / month (MTN MoMo / Orange Money)

## Where data is stored
- `data/db.json` → users, comics, chapters, payments
- `data/uploads/` → PDFs, covers, banners
**Back up the `data` folder.** On hosting, it must be on a persistent disk.

## Real payments (next step)
Sign up at https://business.notchpay.co (MTN MoMo, Orange Money, cards, withdraw to MoMo),
then connect your API keys in `payments.js` → `startCheckout()`.
