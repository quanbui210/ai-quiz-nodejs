# Local Google OAuth Setup - Step by Step Guide

## 🎯 Important: For Local Development

**You do NOT need to:**
- ❌ Configure anything in Supabase's hosted dashboard
- ❌ Enable providers in Supabase Cloud
- ❌ Have a Supabase Cloud account

**You ONLY need:**
- ✅ Google Cloud Console account (free)
- ✅ Google OAuth credentials (Client ID & Secret)
- ✅ Add credentials to your `.env` file

---

## 📝 Step-by-Step: Get Google OAuth Credentials

### Step 1: Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Sign in with your Google account (any Google account works - Gmail, etc.)

### Step 2: Create or Select a Project

1. Click the **project dropdown** at the top (next to "Google Cloud")
2. Click **"New Project"**
   - **Project name**: `Quiz App Local Dev` (or any name you like)
   - **Organization**: Leave as "No organization" (optional)
   - Click **"Create"**
3. Wait a few seconds, then select your new project from the dropdown

### Step 3: Configure OAuth Consent Screen

1. In the left sidebar, go to **"APIs & Services"** > **"OAuth consent screen"**
2. Select **"External"** (for testing/development)
3. Click **"Create"**
4. Fill in the required fields:
   - **App name**: `Quiz App` (or any name)
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **"Save and Continue"**
6. On **"Scopes"** page: Click **"Save and Continue"** (no changes needed)
7. On **"Test users"** page:
   - Click **"Add Users"**
   - Add your email address (and any test emails)
   - Click **"Add"**
   - Click **"Save and Continue"**
8. Review and click **"Back to Dashboard"**

### Step 4: Create OAuth Credentials

1. In the left sidebar, go to **"APIs & Services"** > **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. If prompted, select **"Web application"** as the application type
5. Fill in:
   - **Name**: `Local Development Client` (or any name)
   - **Authorized JavaScript origins**: 
     ```
     http://127.0.0.1:55321
     http://localhost:55321
     ```
   - **Authorized redirect URIs**: 
     ```
     http://127.0.0.1:55321/auth/v1/callback
     http://localhost:55321/auth/v1/callback
     ```
6. Click **"CREATE"**

### Step 5: Copy Your Credentials

After creating, you'll see a popup with:
- **Your Client ID**: `123456789-abcdefghijklmnop.apps.googleusercontent.com`
- **Your Client secret**: `GOCSPX-xxxxxxxxxxxxxxxxxxxxx`

**⚠️ IMPORTANT**: Copy these NOW - you won't be able to see the secret again!

### Step 6: Add to Your `.env` File

Open your `.env` file and replace the placeholders:

```env
GOOGLE_CLIENT_ID="your-actual-client-id-here.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-actual-client-secret-here"
```

**Example:**
```env
GOOGLE_CLIENT_ID="123456789-abcdefghijklmnop.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxxx"
```

### Step 7: Restart Supabase

```bash
npx supabase stop
npx supabase start
```

### Step 8: Test It!

1. Start your server: `npm run dev`
2. Visit: `http://localhost:3000/api/auth/login`
3. You should get a JSON response with a `url` field
4. Open that URL in your browser to test Google login!

---

## 🔍 Where to Find Your Credentials Later

If you need to view your credentials again:

1. Go to: https://console.cloud.google.com/
2. Select your project
3. Go to **"APIs & Services"** > **"Credentials"**
4. Click on your OAuth 2.0 Client ID
5. You can see the **Client ID** (but not the secret - you'll need to create a new one if lost)

---

## ❓ FAQ

### Q: Do I need a paid Google Cloud account?
**A:** No! Google Cloud Console is free. OAuth credentials are free for development.

### Q: Can I use the same credentials for production?
**A:** Yes, but you'll need to add your production redirect URIs to the authorized list in Google Console.

### Q: What if I lose my Client Secret?
**A:** You can't recover it. You'll need to create a new OAuth client ID in Google Console.

### Q: Do I need to enable any APIs?
**A:** No! The OAuth consent screen and credentials are all you need.

### Q: Can I use my personal Gmail account?
**A:** Yes! Any Google account works for creating OAuth credentials.

---

## 🚨 Common Issues

### Issue: "redirect_uri_mismatch"
**Solution**: Make sure the redirect URI in Google Console exactly matches:
```
http://127.0.0.1:55321/auth/v1/callback
```

### Issue: "Invalid client"
**Solution**: 
- Check that your Client ID and Secret are correct in `.env`
- Make sure there are no extra spaces or quotes
- Restart Supabase after updating `.env`

### Issue: "Access blocked: This app's request is invalid"
**Solution**: 
- Make sure you added your email as a test user in OAuth consent screen
- Make sure the OAuth consent screen is set to "External" (not "Internal")

---

## 📚 Quick Reference

**Google Cloud Console**: https://console.cloud.google.com/
**Your Redirect URI**: `http://127.0.0.1:55321/auth/v1/callback`
**Your API Endpoint**: `http://localhost:3000/api/auth/login`

---

*That's it! You don't need anything from Supabase Cloud - everything works locally!* 🎉

