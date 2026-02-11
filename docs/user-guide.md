# Traffic AI Admin Panel - User Guide

A comprehensive guide to using every feature of the Traffic AI Admin Panel.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Tracking Pixels](#3-tracking-pixels)
4. [Visitors](#4-visitors)
5. [Audiences](#5-audiences)
6. [Contact Enrichment](#6-contact-enrichment)
7. [Chat](#7-chat)
8. [Account & Billing](#8-account--billing)
9. [Settings](#9-settings)
10. [Admin Features](#10-admin-features)
11. [Subscription Plans](#11-subscription-plans)

---

## 1. Getting Started

### Signing Up

1. Navigate to your Traffic AI Admin Panel URL
2. Click **Sign Up** on the login page
3. Enter your email, password (minimum 8 characters), and details
4. You'll be logged in automatically

### Logging In

- **Email/Password**: Enter your credentials on the login page
- **Google OAuth**: Click "Sign in with Google" for one-click access

### Onboarding Tour

When you first log in, an interactive onboarding tour will guide you through the main features of the dashboard. You can skip the tour at any time or replay it from settings.

### Navigation

The sidebar on the left provides access to all features. Your available menu items depend on your assigned role. The header at the top shows your profile and provides quick access to logout.

---

## 2. Dashboard

The main dashboard (`/`) provides a real-time overview of your tracking data.

### Key Metrics

- **Total Visitors** - Number of unique visitors tracked across all pixels
- **Active Pixels** - Number of currently active tracking pixels
- **Events Today** - Pageviews, clicks, and form submissions in the last 24 hours
- **Identified Visitors** - Visitors matched to contact profiles

### Analytics Widgets

- **Visitor Trend** - Line chart showing visitor volume over time
- **Top Pages** - Most visited pages across your tracked websites
- **Recent Visitors** - Latest identified visitors with enrichment status
- **Lead Scores** - Distribution of visitor lead scores
- **Event Breakdown** - Pageviews, clicks, form submissions, and custom events

### Admin Dashboard

Admins see additional widgets:
- Partner performance breakdown
- System-wide statistics
- Pending approval requests count

---

## 3. Tracking Pixels

Tracking pixels are JavaScript snippets that you install on your website to collect visitor data.

### Viewing Pixels

Navigate to **Pixels** in the sidebar to see all your tracking pixels with:
- Pixel name and associated domain
- Status (active/inactive)
- Total events collected
- Last event timestamp

### Creating a Pixel

1. Click **New Pixel** on the Pixels page
2. Enter a descriptive name (e.g., "Main Website")
3. Enter the domain where it will be installed (e.g., `example.com`)
4. Submit the request

> **Note**: Depending on your plan, pixel creation may require admin approval.

### Installing a Pixel

After your pixel is created/approved:

1. Click on the pixel to view its details
2. Copy the installation code snippet
3. Paste it into your website's `<head>` tag, before the closing `</head>`
4. The pixel will begin tracking visitors immediately

### Installation Guides

Platform-specific installation guides are available for:
- Shopify
- WordPress / WooCommerce
- Squarespace
- Wix
- Custom HTML sites
- And more

Access these from the pixel details page or ask your admin.

### Pixel Events

Once installed, pixels automatically track:
- **Pageviews** - Every page a visitor loads
- **Clicks** - Button and link clicks
- **Form Submissions** - Form completions
- **Scroll Depth** - How far visitors scroll
- **Session Duration** - Time spent on site

---

## 4. Visitors

The Visitors page (`/visitors`) shows all identified visitors across your tracked websites.

### Visitor List

Each visitor entry displays:
- Name (if identified)
- Email address
- Company
- Job title
- Lead score
- First seen / Last seen dates
- Enrichment status

### Filtering & Search

- Search by name, email, or company
- Filter by enrichment status
- Sort by lead score, recency, or visit count

### Visitor Details

Click on a visitor to see:
- Full profile information
- Company details
- Behavioral data (pages visited, time on site, scroll depth)
- Geographic location (city, state, country)
- Enrichment data (LinkedIn URL, phone, etc.)

---

## 5. Audiences

Audiences let you segment visitors into targeted groups based on behavior, demographics, and firmographic data.

### Viewing Audiences

Navigate to **Audiences** to see:
- List of created audiences with contact counts
- Pending audience requests (awaiting approval)
- Audience status and creation date

### Creating a Standard Audience

1. Click **Create Audience**
2. Name your audience (e.g., "Enterprise Decision Makers")
3. Define filter criteria using available attributes:
   - **Behavioral**: Pageviews, sessions, time on site, scroll depth
   - **Firmographic**: Company size, industry, revenue
   - **Geographic**: City, state, country
   - **Engagement**: Lead score, form submissions, clicks
4. Preview matching contacts
5. Submit for creation

### Creating a Custom Audience

1. Click **Custom Audience**
2. Describe your ideal audience in natural language
3. The AI will build targeting criteria automatically
4. Review and approve the generated audience

### Audience Details

Click on an audience to view:
- Audience criteria and filters
- List of matching contacts
- Contact count and growth over time
- Option to export or delete

### Audience Requests

If your plan requires approval for audience creation:
- Your request appears in the **Pending Requests** tab
- Admins review and approve/reject requests
- You'll see the status update in your audience list

---

## 6. Contact Enrichment

The Enrichment page (`/enrich`) lets you look up and enrich contact data using the Traffic AI engine.

### How to Enrich

1. Navigate to **Enrich** in the sidebar
2. Enter one or more search criteria:
   - **Email address**
   - **LinkedIn URL**
   - **Full name + Company**
   - **Company name**
3. Click **Enrich**
4. View the enriched profile data

### Enrichment Data Points

The enrichment engine returns:
- Full name, title, and role
- Company name, size, industry, and revenue
- Email addresses (personal and work)
- Phone numbers
- LinkedIn profile URL
- Location information
- Social media profiles

### Credits

Each enrichment lookup consumes credits from your account. View your remaining credits on the enrichment page. Credits are replenished based on your subscription plan.

---

## 7. Chat

The Chat feature (`/chat`) allows you to view and manage conversations with website visitors.

### Conversations

- View all active and past conversations
- See visitor details alongside messages
- Filter by status (open, closed, pending)

### Messaging

- Read visitor messages in real-time
- Reply directly from the admin panel
- View conversation history

### Auto-Replies

Set up automatic responses at **Chat > Auto-Replies**:

1. Click **New Auto-Reply**
2. Define trigger conditions (keywords, page URL, visitor attributes)
3. Write the auto-reply message
4. Enable/disable as needed

Auto-replies help engage visitors when your team is unavailable.

---

## 8. Account & Billing

### Profile (`/account/profile`)

Manage your personal account settings:
- Update full name, phone, and company
- Change company website URL
- View account creation date and role

### Billing (`/account/billing`)

Manage your subscription:
- View current plan and features
- Compare available plans
- Upgrade or downgrade your subscription
- Access the Stripe billing portal to:
  - Update payment method
  - View invoice history
  - Cancel subscription

### Trial

New accounts start with a free trial that includes:
- Full feature access
- Limited credits
- Trial end date displayed in the header

Upgrade before your trial ends to maintain access.

---

## 9. Settings

The Settings page (`/settings`) lets you customize your experience.

### Theme Customization

- Adjust the primary theme color
- Changes apply in real-time using CSS variables
- Theme persists across sessions

### Preferences

- Notification preferences
- Default view settings

---

## 10. Admin Features

Admin-only features are available to users with the `admin` role.

### User Management (`/admin/users`)

- **View all users** - See every registered account
- **Assign roles** - Change user roles (admin, team, user)
- **Assign API keys** - Give users access to the Traffic AI API
- **Extend trials** - Modify trial expiration dates
- **View user activity** - See last login and usage stats

### Role Management (`/admin/roles`)

- Create and edit roles
- Assign menu items to roles (controls sidebar navigation)
- System roles (admin, team, user) cannot be deleted
- Custom roles can be created for specific team needs

### Audit Logs (`/admin/logs`)

- View a chronological log of all user actions
- Filter by user, action type, or date range
- Actions logged include:
  - Authentication events
  - API calls (audiences, enrichment, pixels)
  - Admin actions (role changes, key assignments)
  - Resource creation/deletion

### Request Approval (`/admin/requests`)

Review and approve/reject:
- **Pixel requests** - New tracking pixel installations
- **Audience requests** - New audience segment creation

### Installation Guides (`/admin/installation-guides`)

- Create and manage pixel installation guides
- Platform-specific instructions (Shopify, WordPress, etc.)
- Rich text content with code snippets

### Admin Notifications

- System notifications for pending actions
- New user signups
- Pending approval requests

---

## 11. Subscription Plans

Traffic AI offers tiered plans to fit different needs:

| Feature | Starter | Growth | Professional | Enterprise |
|---------|---------|--------|--------------|------------|
| Tracking Pixels | Limited | More | Expanded | Unlimited |
| Visitor Tracking | Basic | Enhanced | Advanced | Full |
| Audiences | Standard | Standard + Custom | All types | All types |
| Contact Enrichment | Limited credits | More credits | High credits | Unlimited |
| Chat | - | Basic | Full | Full + Priority |
| Team Members | 1 | Up to 5 | Up to 20 | Unlimited |
| API Access | - | Basic | Full | Full |
| Support | Email | Email + Chat | Priority | Dedicated |

### Upgrading

1. Go to **Account > Billing**
2. Select your desired plan
3. Complete checkout via Stripe
4. Features unlock immediately

### Feature Gating

If you try to access a feature not included in your plan, you'll see an upgrade prompt with details about which plan includes that feature.

---

## Tips & Best Practices

1. **Install pixels early** - The sooner you start tracking, the more data you collect
2. **Check your dashboard daily** - Stay on top of visitor trends and engagement
3. **Use custom audiences** - AI-powered audience creation saves time and finds patterns you might miss
4. **Enrich key visitors** - Focus enrichment credits on high lead-score visitors
5. **Set up auto-replies** - Engage visitors 24/7 without manual intervention
6. **Review audit logs** - Keep track of team activity and system changes

---

## Getting Help

- Contact your admin for role or access issues
- Check the [Quick Guide](./quick-guide.md) for setup help
- Review the [Developer Guide](./developer-guide.md) for technical details
