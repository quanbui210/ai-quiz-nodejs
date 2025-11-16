# Subscription System Setup Guide

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate Prisma Client:**
   ```bash
   npm run prisma:generate
   ```

3. **Run database migrations:**
   ```bash
   npm run prisma:migrate
   # OR if you prefer to push schema directly:
   npm run prisma:push
   ```

## Setup Steps

### 1. Seed Default Subscription Plans

After running migrations, seed the default subscription plans:

```bash
npm run seed:plans
```

This will create:
- **Free Plan** (default): 5 topics, 10 quizzes, 0 documents, gpt-3.5-turbo only
- **Pro Plan**: 50 topics, 200 quizzes, 20 documents, gpt-3.5-turbo + gpt-4-turbo
- **Premium Plan**: 200 topics, 1000 quizzes, 50 documents, all models (gpt-3.5-turbo, gpt-4-turbo, gpt-4o)

**Note:** All paid plans use **yearly recurring subscriptions**. The billing interval is determined by your Stripe Price configuration. Make sure to create Stripe Prices with `interval: "year"` for yearly billing.

### 2. Configure Stripe (Optional for Development)

For development, placeholder keys are used. To use real Stripe:

1. **Get Stripe API Keys:**
   - Sign up at https://stripe.com
   - Get your API keys from the Stripe Dashboard

2. **Create Products and Prices:**
   - Go to Stripe Dashboard → Products
   - Create products for "Pro" and "Premium" plans
   - Create a Price with `Recurring` billing
   - **Important:** Set interval to `Year` for yearly subscriptions
   - Note the Price ID (e.g., `price_xxxxx`)

3. **Update Environment Variables:**
   ```env
   STRIPE_SECRET_KEY=sk_test_xxxxx
   STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```

4. **Update Plan Price IDs:**
   - Update the `stripePriceId` field in the `SubscriptionPlan` table for Pro and Premium plans
   - You can do this via admin API or directly in the database

### 3. Configure Webhook Endpoint

1. **In Stripe Dashboard:**
   - Go to Developers → Webhooks
   - Add endpoint: `https://your-domain.com/api/v1/subscription/webhook`
   - Select events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

2. **For Local Development:**
   - Use Stripe CLI: `stripe listen --forward-to localhost:3001/api/v1/subscription/webhook`
   - The CLI will provide a webhook secret for local testing

### 4. Create First Admin User

After creating a user account, you can make them an admin:

```bash
POST /api/v1/admin/users/{userId}/make-admin
{
  "role": "SUPER_ADMIN",
  "permissions": []
}


```

## Testing

### Test Subscription Flow

1. **Get available plans:**
   ```bash
   GET /api/v1/subscription/plans
   ```

2. **Get current subscription:**
   ```bash
   GET /api/v1/subscription/me
   ```

3. **Create checkout session (with real Stripe):**
   ```bash
   POST /api/v1/subscription/create-checkout
   {
     "planId": "plan-id-here"
   }
   ```

4. **Test webhook (local with Stripe CLI):**
   ```bash
   stripe trigger checkout.session.completed
   ```

### Test Limit Enforcement

1. **Create topics** - Should fail after reaching limit
2. **Create quizzes** - Should fail after reaching limit
3. **Use different models** - Should fail if model not in allowedModels

### Test Admin Functions

## Admin Authentication

**Important:** Admins can login with email/password OR Google OAuth. There is no separate admin login route.

**Admin Login Options:**

### Option 1: Email/Password Login (Recommended for Admin)
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@admin.com",
  "password": "password"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": { ... },
  "session": { ... },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### Option 2: Google OAuth Login (Same as Regular Users)
```bash
GET /api/v1/auth/login
```
This redirects to Google OAuth (same as regular users).

**Admin Login Flow:**
1. **Create Admin User:**
   ```bash
   npm run seed:admin
   ```
   This creates an admin user with:
   - Email: `admin@admin.com` (or set `ADMIN_EMAIL` in `.env`)
   - Password: `password` (or set `ADMIN_PASSWORD` in `.env`)
   - Role: `SUPER_ADMIN`

2. **Login as Admin:**
   - **Email/Password:** `POST /api/v1/auth/login` with email and password
   - **Google OAuth:** `GET /api/v1/auth/login` (if admin email is linked to Google)
   - Use the returned `access_token` in `Authorization: Bearer <token>` header

3. **After login:** The system checks if the user has an `AdminUser` record in the database.
   - If yes → User can access admin endpoints
   - If no → User is treated as a regular user

**Admin Endpoints (all require authentication + AdminUser profile):**

1. **List users:**
   ```bash
   GET /api/v1/admin/users
   Authorization: Bearer <token>
   ```

2. **Update user limits:**
   ```bash
   PUT /api/v1/admin/users/{userId}/limits
   Authorization: Bearer <token>
   {
     "maxTopics": 100,
     "maxQuizzes": 500
   }
   ```

3. **Create custom plan (Super Admin only):**
   ```bash
   POST /api/v1/admin/plans
   Authorization: Bearer <token>
   {
     "name": "Custom Plan",
     "maxTopics": 25,
     "maxQuizzes": 50,
     "allowedModels": ["gpt-3.5-turbo"]
   }
   ```

## Important Notes

1. **New Users**: Automatically get the default (Free) plan on registration
2. **Usage Tracking**: Automatically increments/decrements when creating/deleting topics and quizzes
3. **Admin Overrides**: Admin changes to limits persist even if user changes subscription plan
4. **Model Selection**: Users can only use models in their `allowedModels` array
5. **Stripe Webhooks**: Must be configured for subscription changes to work properly

## Troubleshooting

### Prisma Client Errors
If you see errors about missing Prisma models:
```bash
npm run prisma:generate
```

### Stripe Errors
- Check that `STRIPE_SECRET_KEY` is set (even if placeholder)
- Webhook signature verification will fail with placeholder secret
- For local testing, use Stripe CLI

### Limit Not Enforced
- Check that user has a subscription record
- Verify middleware is applied to routes
- Check usage counts in database

### Admin Access Denied
- Verify user has `AdminUser` record in database
- Check role is one of: SUPER_ADMIN, ADMIN, MODERATOR

## Next Steps

1. ✅ Run migrations and seed plans
2. ✅ Set up Stripe (optional for now)
3. ✅ Create admin user
4. ✅ Test subscription flow
5. ✅ Test limit enforcement
6. ✅ Test admin functions

For production:
- Use real Stripe keys
- Set up proper webhook endpoint
- Configure CORS properly
- Add rate limiting
- Set up monitoring

