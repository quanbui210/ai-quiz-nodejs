# Subscription System Implementation Plan

## Overview

This document outlines the complete flow and architecture for implementing a subscription-based system with Stripe integration, admin management, and usage limits for the Quiz Backend API.

## Quick Reference: Key Flows

### 🎯 Core Concept
- **Default Plans**: Pre-configured plans (Free, Pro, Premium) with fixed limits
- **Custom Plans**: Admin-created plans with custom limits
- **Admin Overrides**: Admins can modify any user's limits regardless of subscription
- **Stripe Integration**: Handles payments and subscription lifecycle

### 📊 Limit Enforcement
1. User creates topic/quiz/document → System checks `UserUsage` counts
2. Compares against `UserSubscription` limits (which may be admin-overridden)
3. If within limit → Proceed and increment usage
4. If exceeded → Return 403 error with limit details

### 💳 Subscription Flow
1. User selects plan → Backend creates Stripe Checkout Session
2. User pays via Stripe → Webhook updates `UserSubscription`
3. Limits automatically updated from plan defaults
4. Admin can still override limits if needed

### 👨‍💼 Admin Management
1. Admin logs in (special auth check)
2. Admin views/modifies user limits via dashboard
3. Changes persist even if user has active Stripe subscription
4. Admin can create custom plans for special cases

### 🤖 Model Selection
1. User's `allowedModels` array determines available AI models
2. Frontend filters UI to show only allowed models
3. Backend validates model selection on quiz creation
4. Different plans have different model access (e.g., Free = gpt-3.5 only)

---

## 1. Database Schema Changes

### 1.1 New Models

#### `SubscriptionPlan`
Stores available subscription plans (both default and custom)
```prisma
model SubscriptionPlan {
  id              String   @id @default(uuid())
  name            String   // e.g., "Free", "Pro", "Premium"
  stripePriceId   String?  @unique // Stripe Price ID
  stripeProductId String?  // Stripe Product ID
  isDefault       Boolean  @default(false) // Default plan for new users
  isActive        Boolean  @default(true)
  isCustom        Boolean  @default(false) // Custom plan created by admin
  
  // Limits
  maxTopics       Int      @default(5)
  maxQuizzes      Int      @default(10)
  maxDocuments    Int      @default(0) // For RAG feature
  allowedModels   String[] // e.g., ["gpt-3.5-turbo", "gpt-4-turbo"]
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  subscriptions   UserSubscription[]
}
```

#### `UserSubscription`
Tracks user subscriptions and their current limits
```prisma
model UserSubscription {
  id                String   @id @default(uuid())
  userId            String   @unique
  planId            String
  stripeCustomerId  String?  @unique // Stripe Customer ID
  stripeSubscriptionId String? @unique // Stripe Subscription ID
  
  // Current effective limits (can be overridden by admin)
  maxTopics         Int
  maxQuizzes        Int
  maxDocuments      Int
  allowedModels     String[]
  
  // Subscription status
  status            SubscriptionStatus @default(ACTIVE)
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?
  cancelAtPeriodEnd  Boolean @default(false)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan              SubscriptionPlan @relation(fields: [planId], references: [id])
  
  @@index([userId])
  @@index([stripeCustomerId])
  @@index([stripeSubscriptionId])
}

enum SubscriptionStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  UNPAID
  TRIALING
}
```

#### `UserUsage`
Tracks current usage counts for rate limiting
```prisma
model UserUsage {
  id            String   @id @default(uuid())
  userId        String   @unique
  
  topicsCount   Int      @default(0)
  quizzesCount  Int      @default(0)
  documentsCount Int     @default(0)
  
  lastResetAt   DateTime @default(now()) // For monthly resets if needed
  
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
}
```

#### `AdminUser`
Tracks admin users and their permissions
```prisma
model AdminUser {
  id            String   @id @default(uuid())
  userId        String   @unique
  role          AdminRole @default(MODERATOR)
  permissions   String[] // Additional permissions array
  createdAt     DateTime @default(now())
  
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
}

enum AdminRole {
  SUPER_ADMIN    // Full access
  ADMIN          // Can manage users, plans, limits
  MODERATOR      // Can modify user limits only
}
```

#### `Document` (for RAG feature)
Stores uploaded documents for RAG-based quiz generation
```prisma
model Document {
  id            String   @id @default(uuid())
  userId        String
  filename      String
  filePath      String   // Storage path
  fileSize      Int      // in bytes
  mimeType      String
  status        DocumentStatus @default(UPLOADING)
  vectorized    Boolean  @default(false) // Whether document is indexed for RAG
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([status])
}

enum DocumentStatus {
  UPLOADING
  PROCESSING
  READY
  FAILED
}
```

### 1.2 Updated Models

#### `User` (additions)
```prisma
model User {
  // ... existing fields ...
  
  subscription  UserSubscription?
  usage         UserUsage?
  documents     Document[]
  adminProfile  AdminUser?
  
  // ... existing relations ...
}
```

---

## 2. System Flow

### 2.1 User Registration Flow

```
1. User signs up via Google OAuth
2. System creates User record
3. System automatically creates:
   - UserSubscription with default plan
   - UserUsage with zero counts
4. Default plan limits are applied
```

### 2.2 Subscription Flow (Stripe Integration)

```
1. User clicks "Upgrade" → Frontend calls `/api/v1/subscription/plans`
2. User selects a plan → Frontend calls `/api/v1/subscription/create-checkout`
3. Backend creates Stripe Checkout Session:
   - Creates/retrieves Stripe Customer
   - Creates Checkout Session with plan's priceId
   - Returns checkout URL
4. User redirected to Stripe Checkout
5. After payment:
   - Stripe webhook → `/api/v1/subscription/webhook`
   - Webhook handler:
     a. Verifies webhook signature
     b. Updates UserSubscription:
        - Sets new planId
        - Updates limits from plan
        - Sets subscription status
        - Stores Stripe IDs
     c. Optionally sends confirmation email
6. User redirected back to app with success
```

### 2.3 Limit Enforcement Flow

```
Before any action (create topic/quiz/document):
1. Middleware checks user's subscription limits
2. Queries UserUsage for current counts
3. Compares against UserSubscription limits
4. If within limits → proceed
5. If exceeded → return 403 with limit details
```

### 2.4 Admin Override Flow

```
1. Admin logs in (special admin auth check)
2. Admin accesses dashboard → `/api/v1/admin/dashboard`
3. Admin selects user → `/api/v1/admin/users/:userId`
4. Admin modifies limits:
   - Updates UserSubscription limits directly
   - Changes persist even if user has active Stripe subscription
   - Admin changes take precedence over plan defaults
5. System logs admin actions for audit
```

### 2.5 Model Selection Flow

```
1. User creates quiz → Frontend shows available models
2. Backend checks UserSubscription.allowedModels
3. Frontend filters UI to show only allowed models
4. On quiz creation:
   - Validates selected model is in allowedModels
   - If not → return 403
   - If yes → proceed with selected model
```

---

## 3. API Endpoints

### 3.1 Subscription Endpoints

```
GET    /api/v1/subscription/plans
       - List all available subscription plans
       - Returns: plans with limits and pricing

GET    /api/v1/subscription/me
       - Get current user's subscription details
       - Returns: subscription, limits, usage counts

POST   /api/v1/subscription/create-checkout
       - Create Stripe Checkout Session
       - Body: { planId: string }
       - Returns: { checkoutUrl: string }

POST   /api/v1/subscription/webhook
       - Stripe webhook handler (no auth required)
       - Handles: checkout.session.completed, customer.subscription.updated, etc.

POST   /api/v1/subscription/cancel
       - Cancel current subscription
       - Sets cancelAtPeriodEnd = true

POST   /api/v1/subscription/resume
       - Resume canceled subscription
       - Sets cancelAtPeriodEnd = false

GET    /api/v1/subscription/portal
       - Get Stripe Customer Portal URL
       - For managing payment methods, invoices, etc.
```

### 3.2 Admin Endpoints

```
GET    /api/v1/admin/dashboard
       - Admin dashboard stats
       - Returns: total users, subscriptions, revenue, etc.

GET    /api/v1/admin/users
       - List all users with pagination
       - Query params: page, limit, search, role

GET    /api/v1/admin/users/:userId
       - Get user details with subscription and usage

PUT    /api/v1/admin/users/:userId/limits
       - Update user limits (overrides subscription plan)
       - Body: { maxTopics?, maxQuizzes?, maxDocuments?, allowedModels? }

PUT    /api/v1/admin/users/:userId/subscription
       - Change user's subscription plan
       - Body: { planId: string }

POST   /api/v1/admin/users/:userId/make-admin
       - Grant admin privileges
       - Body: { role: AdminRole, permissions?: string[] }

DELETE /api/v1/admin/users/:userId/revoke-admin
       - Revoke admin privileges

GET    /api/v1/admin/plans
       - List all subscription plans (including custom)

POST   /api/v1/admin/plans
       - Create custom subscription plan
       - Body: { name, limits, stripePriceId?, ... }

PUT    /api/v1/admin/plans/:planId
       - Update subscription plan

DELETE /api/v1/admin/plans/:planId
       - Delete custom plan (cannot delete default plans)
```

### 3.3 Updated Endpoints (with limit checks)

```
POST   /api/v1/topic/create
       - Check: topicsCount < maxTopics
       - Increment usage on success

POST   /api/v1/quiz/create
       - Check: quizzesCount < maxQuizzes
       - Check: model in allowedModels
       - Increment usage on success

POST   /api/v1/documents/upload (new)
       - Check: documentsCount < maxDocuments
       - Handle file upload
       - Increment usage on success
```

---

## 4. Middleware & Utilities

### 4.1 Limit Check Middleware

```typescript
// middleware/limit-check.middleware.ts
export const checkTopicLimit = async (req, res, next) => {
  const user = req.user;
  const subscription = await getUserSubscription(user.id);
  const usage = await getUserUsage(user.id);
  
  if (usage.topicsCount >= subscription.maxTopics) {
    return res.status(403).json({
      error: "Topic limit exceeded",
      limit: subscription.maxTopics,
      current: usage.topicsCount
    });
  }
  next();
};

// Similar for quizzes, documents, model selection
```

### 4.2 Admin Auth Middleware

```typescript
// middleware/admin.middleware.ts
export const requireAdmin = async (req, res, next) => {
  const user = req.user;
  const adminProfile = await prisma.adminUser.findUnique({
    where: { userId: user.id }
  });
  
  if (!adminProfile) {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  req.admin = adminProfile;
  next();
};

export const requireSuperAdmin = async (req, res, next) => {
  // Similar but checks for SUPER_ADMIN role
};
```

### 4.3 Usage Tracking Utilities

```typescript
// utils/usage.ts
export const incrementTopicCount = async (userId: string) => {
  await prisma.userUsage.upsert({
    where: { userId },
    create: { userId, topicsCount: 1 },
    update: { topicsCount: { increment: 1 } }
  });
};

// Similar for quizzes, documents
// Decrement on delete operations
```

---

## 5. Stripe Integration

### 5.1 Environment Variables

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_WEBHOOK_ENDPOINT=/api/v1/subscription/webhook
```

### 5.2 Stripe Setup

1. **Create Products & Prices in Stripe Dashboard**
   - Free Plan: $0/month (default)
   - Pro Plan: $X/month
   - Premium Plan: $Y/month

2. **Store Price IDs in Database**
   - Admin creates SubscriptionPlan records
   - Links stripePriceId to Stripe Price

3. **Webhook Events to Handle**
   - `checkout.session.completed` - New subscription
   - `customer.subscription.updated` - Plan change, renewal
   - `customer.subscription.deleted` - Cancellation
   - `invoice.payment_succeeded` - Successful payment
   - `invoice.payment_failed` - Failed payment

### 5.3 Stripe Customer Portal

- Allow users to manage:
  - Payment methods
  - Billing history
  - Subscription cancellation
  - Plan upgrades/downgrades

---

## 6. Implementation Steps

### Phase 1: Database & Models
1. ✅ Update Prisma schema with new models
2. ✅ Run migrations
3. ✅ Create default subscription plan
4. ✅ Seed initial admin user

### Phase 2: Core Subscription Logic
1. ✅ Create subscription service/utilities
2. ✅ Implement limit checking middleware
3. ✅ Update existing endpoints with limit checks
4. ✅ Create usage tracking utilities

### Phase 3: Stripe Integration
1. ✅ Install Stripe SDK
2. ✅ Create Stripe service
3. ✅ Implement checkout session creation
4. ✅ Implement webhook handler
5. ✅ Test with Stripe test mode

### Phase 4: Admin System
1. ✅ Create admin authentication middleware
2. ✅ Implement admin endpoints
3. ✅ Create admin dashboard API
4. ✅ Add audit logging for admin actions

### Phase 5: Model Selection
1. ✅ Add model selection to quiz creation
2. ✅ Validate model against allowedModels
3. ✅ Update frontend to show only allowed models

### Phase 6: RAG/Document Upload (Future)
1. ✅ Create document upload endpoint
2. ✅ Implement file storage (Supabase Storage or S3)
3. ✅ Add document limit checks
4. ✅ Integrate with quiz generation

### Phase 7: Testing & Polish
1. ✅ Unit tests for limit checking
2. ✅ Integration tests for Stripe webhooks
3. ✅ Admin functionality tests
4. ✅ Load testing for limit enforcement

---

## 7. Default Plans Configuration

### Free Plan (Default)
- maxTopics: 5
- maxQuizzes: 10
- maxDocuments: 0
- allowedModels: ["gpt-3.5-turbo"]
- Price: $0/month

### Pro Plan
- maxTopics: 50
- maxQuizzes: 200
- maxDocuments: 20
- allowedModels: ["gpt-3.5-turbo", "gpt-4-turbo"]
- Price: $X/month (configurable)

### Premium Plan
- maxTopics: 200
- maxQuizzes: 1000
- maxDocuments: 50
- allowedModels: ["gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o"]
- Price: $Y/month (configurable)

---

## 8. Edge Cases & Considerations

### 8.1 Limit Overrides
- Admin overrides take precedence over plan limits
- When admin changes limits, they persist even if user changes plan
- Option: Add "reset to plan defaults" admin action

### 8.2 Subscription Changes
- User upgrades: Immediately apply new limits
- User downgrades: 
  - If current usage exceeds new limits → warn user
  - Option: Allow grace period or force cleanup
- User cancels: Limits remain until period end

### 8.3 Usage Counts
- Increment on creation
- Decrement on deletion
- Handle edge cases (cascade deletes, etc.)
- Consider monthly resets if needed

### 8.4 Stripe Webhook Reliability
- Implement idempotency (check if event already processed)
- Retry logic for failed webhooks
- Log all webhook events for debugging

### 8.5 Admin Security
- Strong authentication for admin endpoints
- Rate limiting on admin actions
- Audit log for all admin changes
- IP whitelist option for super admin

---

## 9. Frontend Integration Points

### 9.1 User Dashboard
- Display current plan and limits
- Show usage counts (e.g., "5/10 quizzes used")
- "Upgrade" button if on free plan
- Link to Stripe Customer Portal

### 9.2 Limit Warnings
- Show warning when approaching limits (e.g., 80% used)
- Disable create buttons when limit reached
- Show upgrade prompt when limit exceeded

### 9.3 Model Selection UI
- Dropdown/radio buttons for model selection
- Disable unavailable models
- Show model info (speed, quality, cost)

### 9.4 Admin Dashboard
- User management table
- Subscription management
- Plan creation/editing
- Analytics and reporting

---

## 10. Migration Strategy

### For Existing Users
1. Create default subscription for all existing users
2. Set usage counts based on current data:
   ```sql
   UPDATE UserUsage 
   SET topicsCount = (SELECT COUNT(*) FROM Topic WHERE userId = UserUsage.userId)
   ```
3. Migrate in batches to avoid downtime

---

## 11. Monitoring & Analytics

### Metrics to Track
- Subscription conversion rate
- Plan distribution
- Limit hit frequency
- Admin actions
- Stripe webhook success/failure rate
- Revenue metrics (for paid plans)

### Alerts
- Failed Stripe webhooks
- Admin privilege grants
- Unusual limit overrides
- High usage spikes

---

## Summary

This plan provides a complete subscription system with:
- ✅ Stripe integration for payments
- ✅ Flexible limit management (plan-based + admin overrides)
- ✅ Model selection restrictions
- ✅ Admin dashboard and user management
- ✅ Usage tracking and enforcement
- ✅ Support for future RAG/document features

The system is designed to be:
- **Flexible**: Admin can override any limits
- **Scalable**: Handles subscription changes gracefully
- **Secure**: Proper authentication and authorization
- **Maintainable**: Clear separation of concerns

