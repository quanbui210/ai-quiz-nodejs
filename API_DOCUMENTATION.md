# API Documentation for Frontend

## Base URL
```
Development: http://localhost:3001/api/v1
Production: https://your-domain.com/api/v1
```

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <supabase_access_token>
```

The token is obtained from Supabase Auth after user login.

### Login Endpoints

#### 1. Google OAuth Login
**Endpoint:** `GET /auth/login`

**Query Parameters:**
- `redirectTo` (optional) - Custom redirect URL after authentication

**Response:**
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "message": "Redirect user to this URL to complete Google login"
}
```

**Frontend Flow:**
1. Call `GET /auth/login`
2. Redirect user to the returned `url`
3. User completes Google OAuth
4. Redirect back to your app with tokens
5. Use the access token for authenticated requests

---

#### 2. Email/Password Login
**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  },
  "session": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_at": 1234567890
  },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Status Codes:**
- `200` - Login successful
- `400` - Missing email or password
- `401` - Invalid email or password
- `500` - Server error

**Note:** This endpoint is useful for admin users who have email/password accounts created via the seed script.

**Response includes admin information:**
```json
{
  "message": "Login successful",
  "user": { ... },
  "session": { ... },
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "isAdmin": true,
  "admin": {
    "role": "SUPER_ADMIN",
    "permissions": []
  }
}
```

If the user is not an admin, `isAdmin` will be `false` and `admin` will be omitted.

---

#### 3. Get Current Session
**Endpoint:** `GET /auth/session`

**Authentication:** Uses Supabase session (cookies/headers)

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  },
  "session": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_at": 1234567890
  },
  "isAdmin": false,
  "admin": {
    "role": "SUPER_ADMIN",
    "permissions": []
  }
}
```

**Response Fields:**
- `user` - Supabase user object
- `session` - Supabase session object
- `isAdmin` - Boolean indicating if user is an admin
- `admin` - Admin information (only present if `isAdmin` is `true`)
  - `role` - Admin role: `SUPER_ADMIN`, `ADMIN`, or `MODERATOR`
  - `permissions` - Array of additional permissions

**Status Codes:**
- `200` - Session found
- `401` - No active session

---

#### 4. Get Current User
**Endpoint:** `GET /auth/me`

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "avatarUrl": "https://...",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "isAdmin": true,
  "admin": {
    "role": "SUPER_ADMIN",
    "permissions": []
  }
}
```

**Response Fields:**
- `user` - Prisma user object with full profile
- `isAdmin` - Boolean indicating if user is an admin
- `admin` - Admin information (only present if `isAdmin` is `true`)
  - `role` - Admin role: `SUPER_ADMIN`, `ADMIN`, or `MODERATOR`
  - `permissions` - Array of additional permissions

**Status Codes:**
- `200` - User found
- `401` - Unauthenticated
- `404` - User profile not found

**Frontend Usage:**
```javascript
// Check if user is admin
const response = await fetch('http://localhost:3001/api/v1/auth/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
const data = await response.json();

if (data.isAdmin) {
  // Show admin dashboard
  console.log('Admin role:', data.admin.role);
} else {
  // Show regular user dashboard
}
```

---

## Subscription Endpoints

### 1. Get All Plans
Get a list of all active subscription plans.

**Endpoint:** `GET /subscription/plans`

**Authentication:** Not required

**Response:**
```json
{
  "plans": [
    {
      "id": "uuid",
      "name": "Free",
      "stripePriceId": "price_xxxxx",
      "stripeProductId": "prod_xxxxx",
      "isDefault": true,
      "isActive": true,
      "isCustom": false,
      "maxTopics": 5,
      "maxQuizzes": 10,
      "maxDocuments": 0,
      "allowedModels": ["gpt-3.5-turbo"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 2. Get My Subscription
Get the current user's subscription details and usage.

**Endpoint:** `GET /subscription/me`

**Authentication:** Required

**Response:**
```json
{
  "subscription": {
    "id": "uuid",
    "userId": "uuid",
    "planId": "uuid",
    "stripeCustomerId": "cus_xxxxx",
    "stripeSubscriptionId": "sub_xxxxx",
    "maxTopics": 5,
    "maxQuizzes": 10,
    "maxDocuments": 0,
    "allowedModels": ["gpt-3.5-turbo"],
    "status": "ACTIVE",
    "currentPeriodStart": "2024-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2024-01-31T23:59:59.999Z",
    "cancelAtPeriodEnd": false,
    "plan": {
      "id": "uuid",
      "name": "Free",
      "maxTopics": 5,
      "maxQuizzes": 10,
      "maxDocuments": 0,
      "allowedModels": ["gpt-3.5-turbo"]
    }
  },
  "usage": {
    "topicsCount": 3,
    "quizzesCount": 7,
    "documentsCount": 0,
    "topicsRemaining": 2,
    "quizzesRemaining": 3,
    "documentsRemaining": 0
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthenticated

---

### 3. Create Checkout Session
Create a Stripe checkout session for subscribing to a plan.

**Endpoint:** `POST /subscription/create-checkout`

**Authentication:** Required

**Request Body:**
```json
{
  "planId": "uuid"
}
```

**Response:**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_xxxxx",
  "sessionId": "cs_xxxxx"
}
```

**Frontend Flow:**
1. User selects a plan
2. Call this endpoint with the `planId`
3. Redirect user to `checkoutUrl`
4. After payment, Stripe redirects to:
   - Success: `/subscription/success?session_id={CHECKOUT_SESSION_ID}`
   - Cancel: `/subscription/cancel`
5. On success page, verify the subscription was created by calling `GET /subscription/me`

**Status Codes:**
- `200` - Checkout session created
- `400` - Invalid planId or plan has no Stripe price ID
- `401` - Unauthenticated
- `404` - Plan not found
- `500` - Server error

---

### 4. Cancel Subscription
Cancel the current user's subscription (cancels at period end).

**Endpoint:** `POST /subscription/cancel`

**Authentication:** Required

**Request Body:** None

**Response:**
```json
{
  "message": "Subscription will be canceled at the end of the current period",
  "subscription": {
    "id": "uuid",
    "status": "ACTIVE",
    "cancelAtPeriodEnd": true,
    "currentPeriodEnd": "2024-01-31T23:59:59.999Z"
  }
}
```

**Status Codes:**
- `200` - Subscription cancellation scheduled
- `400` - No active subscription found
- `401` - Unauthenticated
- `500` - Server error

---

### 5. Resume Subscription
Resume a canceled subscription (if still within the current period).

**Endpoint:** `POST /subscription/resume`

**Authentication:** Required

**Request Body:** None

**Response:**
```json
{
  "message": "Subscription has been resumed",
  "subscription": {
    "id": "uuid",
    "status": "ACTIVE",
    "cancelAtPeriodEnd": false
  }
}
```

**Status Codes:**
- `200` - Subscription resumed
- `400` - Subscription is not scheduled for cancellation
- `401` - Unauthenticated
- `500` - Server error

---

### 6. Get Customer Portal
Get a Stripe Customer Portal URL for managing subscription.

**Endpoint:** `GET /subscription/portal`

**Authentication:** Required

**Response:**
```json
{
  "url": "https://billing.stripe.com/p/session_xxxxx"
}
```

**Frontend Flow:**
1. Call this endpoint
2. Redirect user to the returned `url`
3. User can manage subscription, payment methods, invoices in Stripe's portal

**Status Codes:**
- `200` - Portal URL generated
- `400` - No Stripe customer found
- `401` - Unauthenticated
- `500` - Server error

---

## Admin Endpoints

**Note:** All admin endpoints require:
1. User authentication (Bearer token)
2. User must have an AdminUser profile (any role: SUPER_ADMIN, ADMIN, or MODERATOR)

Some endpoints require `SUPER_ADMIN` role (indicated below).

---

### 1. Get Dashboard Stats
Get comprehensive overview statistics for the admin dashboard, including users, subscriptions, revenue, content, and usage metrics.

**Endpoint:** `GET /admin/dashboard`

**Authentication:** Required (Admin)

**Response:**
```json
{
  "stats": {
    // User statistics
    "totalUsers": 150,
    "activeSubscriptions": 100,
    "canceledSubscriptions": 20,
    "freeSubscriptions": 50,
    "paidSubscriptions": 50,
    "totalSubscriptions": 120,
    
    // Content statistics
    "totalTopics": 500,
    "totalQuizzes": 2000,
    "totalDocuments": 150,
    
    // Usage statistics (aggregated across all users)
    "totalUsage": {
      "topics": 450,
      "quizzes": 1800,
      "documents": 120
    },
    
    // Revenue statistics (from Stripe)
    "revenue": {
      "total": 12500.00,
      "monthly": 1200.00,
      "yearly": 12500.00,
      "currency": "USD"
    },
    
    // Plan statistics
    "totalPlans": 3,
    "subscriptionBreakdown": [
      {
        "planId": "uuid",
        "planName": "Free",
        "count": 50
      },
      {
        "planId": "uuid",
        "planName": "Pro",
        "count": 30
      },
      {
        "planId": "uuid",
        "planName": "Premium",
        "count": 20
      }
    ]
  }
}
```

**Response Fields:**
- `totalUsers` - Total number of users in the system
- `activeSubscriptions` - Number of active subscriptions
- `canceledSubscriptions` - Number of canceled subscriptions
- `freeSubscriptions` - Number of users on free plan
- `paidSubscriptions` - Number of users on paid plans
- `totalSubscriptions` - Total subscriptions (active + canceled)
- `totalTopics` - Total topics created by all users
- `totalQuizzes` - Total quizzes created by all users
- `totalDocuments` - Total documents uploaded by all users
- `totalUsage` - Aggregated usage counts (may differ from total content if users deleted items)
- `revenue` - Revenue data from Stripe (fetched from paid invoices)
  - `total` - Total revenue from last 12 months
  - `monthly` - Revenue from last 30 days
  - `yearly` - Total revenue (same as total, since all subscriptions are yearly)
  - `currency` - Currency code (e.g., "USD")
- `totalPlans` - Total number of subscription plans
- `subscriptionBreakdown` - Breakdown of active subscriptions by plan

**Note:** Revenue data is fetched from Stripe. If Stripe API fails, revenue fields will be 0 but other stats will still be returned.

**Status Codes:**
- `200` - Success
- `401` - Unauthenticated
- `403` - Not an admin
- `500` - Server error

---

### 2. List Users
Get a paginated list of all users.

**Endpoint:** `GET /admin/users`

**Authentication:** Required (Admin)

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page
- `search` (optional) - Search by email or name

**Example:** `GET /admin/users?page=1&limit=20&search=john`

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": "https://...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "subscription": {
        "id": "uuid",
        "planId": "uuid",
        "status": "ACTIVE",
        "maxTopics": 5,
        "maxQuizzes": 10,
        "plan": {
          "id": "uuid",
          "name": "Free"
        }
      },
      "usage": {
        "topicsCount": 3,
        "quizzesCount": 7,
        "documentsCount": 0
      },
      "adminProfile": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthenticated
- `403` - Not an admin

---

### 3. Get User Details
Get detailed information about a specific user.

**Endpoint:** `GET /admin/users/:userId`

**Authentication:** Required (Admin)

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "https://...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "subscription": {
      "id": "uuid",
      "planId": "uuid",
      "status": "ACTIVE",
      "maxTopics": 5,
      "maxQuizzes": 10,
      "maxDocuments": 0,
      "allowedModels": ["gpt-3.5-turbo"],
      "plan": {
        "id": "uuid",
        "name": "Free"
      }
    },
    "usage": {
      "topicsCount": 3,
      "quizzesCount": 7,
      "documentsCount": 0
    },
    "adminProfile": null
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Missing userId
- `401` - Unauthenticated
- `403` - Not an admin
- `404` - User not found

---

### 4. Update User Limits
Override a user's subscription limits (admin override).

**Endpoint:** `PUT /admin/users/:userId/limits`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "maxTopics": 100,
  "maxQuizzes": 500,
  "maxDocuments": 20,
  "allowedModels": ["gpt-3.5-turbo", "gpt-4-turbo"]
}
```

**Note:** All fields are optional. Only include fields you want to update.

**Response:**
```json
{
  "message": "User limits updated successfully",
  "subscription": {
    "id": "uuid",
    "maxTopics": 100,
    "maxQuizzes": 500,
    "maxDocuments": 20,
    "allowedModels": ["gpt-3.5-turbo", "gpt-4-turbo"]
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid input
- `401` - Unauthenticated
- `403` - Not an admin
- `404` - User not found
- `500` - Server error

---

### 5. Change User Subscription Plan
Change a user's subscription plan.

**Endpoint:** `PUT /admin/users/:userId/subscription`

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "planId": "uuid"
}
```

**Response:**
```json
{
  "message": "User subscription updated successfully",
  "subscription": {
    "id": "uuid",
    "planId": "uuid",
    "status": "ACTIVE",
    "plan": {
      "id": "uuid",
      "name": "Pro"
    }
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid planId
- `401` - Unauthenticated
- `403` - Not an admin
- `404` - User or plan not found
- `500` - Server error

---

### 6. Make User Admin
Grant admin privileges to a user.

**Endpoint:** `POST /admin/users/:userId/make-admin`

**Authentication:** Required (Super Admin only)

**Request Body:**
```json
{
  "role": "ADMIN",
  "permissions": ["manage_users", "view_analytics"]
}
```

**Valid Roles:**
- `SUPER_ADMIN` - Full access
- `ADMIN` - Administrative access
- `MODERATOR` - Limited admin access

**Note:** `permissions` is optional. Super admins have all permissions automatically.

**Response:**
```json
{
  "message": "Admin privileges granted successfully",
  "admin": {
    "id": "uuid",
    "userId": "uuid",
    "role": "ADMIN",
    "permissions": ["manage_users", "view_analytics"],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid role or missing userId
- `401` - Unauthenticated
- `403` - Not a super admin
- `404` - User not found
- `500` - Server error

---

### 7. Revoke Admin Privileges
Remove admin privileges from a user.

**Endpoint:** `DELETE /admin/users/:userId/revoke-admin`

**Authentication:** Required (Super Admin only)

**Response:**
```json
{
  "message": "Admin privileges revoked successfully"
}
```

**Status Codes:**
- `200` - Success
- `400` - Cannot revoke own admin privileges or missing userId
- `401` - Unauthenticated
- `403` - Not a super admin
- `404` - User is not an admin
- `500` - Server error

---

### 8. List All Plans
Get all subscription plans (including inactive and custom plans).

**Endpoint:** `GET /admin/plans`

**Authentication:** Required (Admin)

**Response:**
```json
{
  "plans": [
    {
      "id": "uuid",
      "name": "Free",
      "stripePriceId": "price_xxxxx",
      "stripeProductId": "prod_xxxxx",
      "isDefault": true,
      "isActive": true,
      "isCustom": false,
      "maxTopics": 5,
      "maxQuizzes": 10,
      "maxDocuments": 0,
      "allowedModels": ["gpt-3.5-turbo"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthenticated
- `403` - Not an admin

---

### 9. Create Custom Plan
Create a new custom subscription plan.

**Endpoint:** `POST /admin/plans`

**Authentication:** Required (Super Admin only)

**Request Body:**
```json
{
  "name": "Enterprise",
  "stripePriceId": "price_xxxxx",
  "stripeProductId": "prod_xxxxx",
  "isActive": true,
  "maxTopics": 1000,
  "maxQuizzes": 5000,
  "maxDocuments": 100,
  "allowedModels": ["gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o"]
}
```

**Note:** `stripePriceId` and `stripeProductId` are optional if creating a non-Stripe plan.

**Response:**
```json
{
  "message": "Plan created successfully",
  "plan": {
    "id": "uuid",
    "name": "Enterprise",
    "maxTopics": 1000,
    "maxQuizzes": 5000,
    "maxDocuments": 100,
    "allowedModels": ["gpt-3.5-turbo", "gpt-4-turbo", "gpt-4o"]
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid input
- `401` - Unauthenticated
- `403` - Not a super admin
- `500` - Server error

---

### 10. Update Plan
Update an existing subscription plan.

**Endpoint:** `PUT /admin/plans/:planId`

**Authentication:** Required (Super Admin only)

**Request Body:**
```json
{
  "name": "Enterprise Plus",
  "maxTopics": 2000,
  "maxQuizzes": 10000,
  "isActive": true
}
```

**Note:** All fields are optional. Only include fields you want to update.

**Response:**
```json
{
  "message": "Plan updated successfully",
  "plan": {
    "id": "uuid",
    "name": "Enterprise Plus",
    "maxTopics": 2000,
    "maxQuizzes": 10000
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid input
- `401` - Unauthenticated
- `403` - Not a super admin
- `404` - Plan not found
- `500` - Server error

---

### 11. Delete Plan
Delete a subscription plan.

**Endpoint:** `DELETE /admin/plans/:planId`

**Authentication:** Required (Super Admin only)

**Response:**
```json
{
  "message": "Plan deleted successfully"
}
```

**Status Codes:**
- `200` - Success
- `400` - Cannot delete default plan or plan has active subscriptions
- `401` - Unauthenticated
- `403` - Not a super admin
- `404` - Plan not found
- `500` - Server error

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message",
  "message": "Additional details (optional)"
}
```

**Common Status Codes:**
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Frontend Integration Examples

### Example: Check Subscription Status
```javascript
async function getSubscriptionStatus() {
  const token = getAuthToken(); // Get from Supabase
  
  const response = await fetch('http://localhost:3001/api/v1/subscription/me', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data;
}
```

### Example: Create Checkout Session
```javascript
async function subscribeToPlan(planId) {
  const token = getAuthToken();
  
  const response = await fetch('http://localhost:3001/api/v1/subscription/create-checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ planId })
  });
  
  const { checkoutUrl } = await response.json();
  window.location.href = checkoutUrl; // Redirect to Stripe
}
```

### Example: Admin - Update User Limits
```javascript
async function updateUserLimits(userId, limits) {
  const token = getAuthToken();
  
  const response = await fetch(`http://localhost:3001/api/v1/admin/users/${userId}/limits`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(limits)
  });
  
  return await response.json();
}
```

### Example: Create Quiz with Model Selection
```javascript
async function createQuiz(quizData) {
  const token = getAuthToken();
  
  const subscriptionResponse = await fetch('http://localhost:3001/api/v1/subscription/me', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const { subscription } = await subscriptionResponse.json();
  const allowedModels = subscription.allowedModels;
  
  const selectedModel = 'gpt-4-turbo';
  
  
  if (!allowedModels.includes(selectedModel)) {
    throw new Error(`Model ${selectedModel} is not allowed for your plan`);
  }
  
  const response = await fetch('http://localhost:3001/api/v1/quiz/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...quizData,
      model: selectedModel el
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error);
  }
  
  return await response.json();
}
```

---

## Important Notes for Frontend

1. **Authentication:** Always include the Bearer token in the Authorization header for authenticated endpoints.

2. **Subscription Flow:**
   - User selects plan → Call `POST /subscription/create-checkout`
   - Redirect to `checkoutUrl`
   - After payment, Stripe redirects to success/cancel URLs
   - On success page, call `GET /subscription/me` to verify subscription

3. **Usage Limits:**
   - Check `usage.topicsRemaining`, `usage.quizzesRemaining`, etc. before allowing actions
   - Display limit warnings when user is close to limits

4. **Admin Access:**
   - Check if user has admin profile before showing admin UI
   - Some endpoints require SUPER_ADMIN role

5. **Error Handling:**
   - Always handle 401 (unauthorized) - redirect to login
   - Handle 403 (forbidden) - show permission denied message
   - Display user-friendly error messages from the `error` field

6. **Model Selection:**
   - Always call `GET /subscription/me` first to get `allowedModels`
   - Display only models from `subscription.allowedModels` in the UI
   - Pass the selected `model` in the request body when creating a quiz: `POST /quiz/create`
   - The backend validates the model - if invalid, you'll get a 403 error with details
   - Default model is `"gpt-3.5-turbo"` if not specified

---

## Quiz Endpoints

### 1. Create Quiz
Create a new quiz using AI. The model selection is dynamic based on the user's subscription plan.

**Endpoint:** `POST /quiz/create`

**Authentication:** Required

**Request Body:**
```json
{
  "topicId": "uuid",
  "title": "JavaScript Closures",
  "difficulty": "INTERMEDIATE",
  "questionCount": 10,
  "timer": 900,
  "model": "gpt-4-turbo"
}
```

**Request Body Fields:**
- `topicId` (required, string) - ID of the topic for the quiz
- `title` (required, string) - Quiz title
- `difficulty` (required, string) - Must be one of: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`
- `questionCount` (required, number) - Number of questions to generate (1-50)
- `timer` (optional, number) - Timer in seconds. Omit or set to `null` for no timer
- `model` (optional, string) - AI model to use. Must be one of the user's `allowedModels` from their subscription. Defaults to `"gpt-3.5-turbo"` if not provided.

**Important Notes:**
- The `model` field is validated against the user's subscription `allowedModels`
- If the requested model is not in the user's allowed models, the request will fail with a 403 error
- To get the user's allowed models, call `GET /subscription/me` first
- Common models: `"gpt-3.5-turbo"`, `"gpt-4-turbo"`, `"gpt-4o"`

**Response:**
```json
{
  "id": "uuid",
  "title": "JavaScript Closures",
  "type": "MULTIPLE_CHOICE",
  "difficulty": "INTERMEDIATE",
  "count": 10,
  "timer": 900,
  "status": "PENDING",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "questions": [
    {
      "id": "uuid",
      "text": "What is a closure in JavaScript?",
      "type": "MULTIPLE_CHOICE",
      "options": ["Option A", "Option B", "Option C", "Option D"]
    }
  ]
}
```

**Status Codes:**
- `201` - Quiz created successfully
- `400` - Invalid input or validation failed
- `401` - Unauthenticated
- `403` - Model not allowed (check `allowedModels` in subscription) or quiz limit exceeded
- `500` - Server error

**Error Response (Model Not Allowed):**
```json
{
  "error": "Model not allowed",
  "requestedModel": "gpt-4o",
  "allowedModels": ["gpt-3.5-turbo", "gpt-4-turbo"],
  "message": "Your plan does not allow using gpt-4o. Allowed models: gpt-3.5-turbo, gpt-4-turbo"
}
```

**Frontend Flow:**
1. Get user's subscription: `GET /subscription/me`
2. Display available models from `subscription.allowedModels`
3. User selects a model
4. Call `POST /quiz/create` with the selected `model` in the request body
5. The backend validates the model against the user's subscription

---

### 2. Get Quiz
Get a quiz by ID (without correct answers).

**Endpoint:** `GET /quiz/:id`

**Authentication:** Required

**Response:**
```json
{
  "quiz": {
    "id": "uuid",
    "title": "JavaScript Closures",
    "type": "MULTIPLE_CHOICE",
    "difficulty": "INTERMEDIATE",
    "count": 10,
    "timer": 900,
    "status": "PENDING",
    "questions": [
      {
        "id": "uuid",
        "text": "What is a closure?",
        "type": "MULTIPLE_CHOICE",
        "options": ["Option A", "Option B", "Option C", "Option D"]
      }
    ]
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthenticated
- `404` - Quiz not found

---

### 3. List Quizzes
Get all quizzes for a specific topic.

**Endpoint:** `GET /quiz/list/:topicId`

**Authentication:** Required

**Response:**
```json
{
  "quizzes": [
    {
      "id": "uuid",
      "title": "JavaScript Closures",
      "difficulty": "INTERMEDIATE",
      "count": 10,
      "status": "PENDING",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthenticated

---

### 4. Submit Quiz Answers
Submit answers and get results with correct answers.

**Endpoint:** `POST /quiz/:quizId/submit`

**Authentication:** Required

**Request Body:**
```json
{
  "answers": [
    {
      "questionId": "uuid",
      "userAnswer": "Option A"
    }
  ],
  "timeSpent": 300,
  "attemptId": "uuid"
}
```

**Response:**
```json
{
  "attemptId": "uuid",
  "quizId": "uuid",
  "quizTitle": "JavaScript Closures",
  "score": 85.5,
  "correctCount": 8,
  "totalQuestions": 10,
  "timeSpent": 300,
  "completedAt": "2024-01-01T00:00:00.000Z",
  "results": [
    {
      "questionId": "uuid",
      "questionText": "What is a closure?",
      "userAnswer": "Option A",
      "correctAnswer": "Option B",
      "isCorrect": false,
      "explanation": "A closure is..."
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid input
- `401` - Unauthenticated
- `404` - Quiz not found

---

### 5. Delete Quiz
Delete a quiz and all its related data.

**Endpoint:** `DELETE /quiz/:id`

**Authentication:** Required

**Response:**
```json
{
  "message": "Quiz deleted successfully",
  "deletedQuizId": "uuid",
  "deletedQuizTitle": "JavaScript Closures"
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthenticated
- `403` - Not the quiz owner
- `404` - Quiz not found

---

## Testing

For local development, you can use the Stripe test mode:
- Test card: `4242 4242 4242 4242`
- Any future expiry date
- Any 3-digit CVC
- Any ZIP code

The webhook endpoint (`POST /subscription/webhook`) is for Stripe only - do not call it from the frontend.

