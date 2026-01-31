-- Create installation_guides table for storing platform-specific installation instructions
CREATE TABLE IF NOT EXISTS public.installation_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL UNIQUE, -- 'wordpress', 'shopify', 'manual', 'gtm', etc.
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content TEXT NOT NULL, -- Markdown content
  icon VARCHAR(100), -- Icon name or URL
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for updated_at
CREATE TRIGGER update_installation_guides_updated_at
  BEFORE UPDATE ON public.installation_guides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.installation_guides ENABLE ROW LEVEL SECURITY;

-- Everyone can read active guides
CREATE POLICY "Anyone can read active guides" ON public.installation_guides
  FOR SELECT USING (is_active = true);

-- Only admins can manage guides
CREATE POLICY "Admins can manage guides" ON public.installation_guides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Grant permissions
GRANT ALL ON public.installation_guides TO authenticated;
GRANT ALL ON public.installation_guides TO service_role;

-- Insert default guides
INSERT INTO public.installation_guides (platform, title, description, content, icon, display_order) VALUES
(
  'wordpress',
  'WordPress Installation',
  'Plugin or theme editor',
  '## WordPress Installation Guide

### Option 1: Using a Plugin (Recommended)

1. Install the **Insert Headers and Footers** plugin from the WordPress plugin directory
2. Go to **Settings → Insert Headers and Footers**
3. Paste your TrafficAI pixel code in the **Scripts in Header** section
4. Click **Save**

### Option 2: Theme Editor

1. Go to **Appearance → Theme Editor**
2. Select your active theme
3. Open the `header.php` file
4. Paste the pixel code just before the closing `</head>` tag
5. Click **Update File**

### Option 3: Child Theme (Best Practice)

1. Create a child theme if you haven''t already
2. Add the following to your child theme''s `functions.php`:

```php
function add_trafficai_pixel() {
  ?>
  <!-- Paste your pixel code here -->
  <?php
}
add_action(''wp_head'', ''add_trafficai_pixel'');
```

### Verification

After installation, visit your website and check the browser''s developer console. You should see TrafficAI tracking initialized.',
  'wordpress',
  1
),
(
  'shopify',
  'Shopify Installation',
  'Add to theme.liquid',
  '## Shopify Installation Guide

### Step 1: Access Theme Editor

1. Log in to your Shopify admin panel
2. Go to **Online Store → Themes**
3. Click **Actions → Edit code** on your active theme

### Step 2: Add the Pixel Code

1. In the left sidebar, find and click on `theme.liquid`
2. Locate the `<head>` section (near the top of the file)
3. Paste your TrafficAI pixel code just before the closing `</head>` tag
4. Click **Save**

### Alternative: Using Shopify''s Script Editor

If you have Shopify Plus:
1. Go to **Settings → Custom scripts**
2. Add your pixel code to run on all pages

### Verification

1. Visit your Shopify store
2. Open browser developer tools (F12)
3. Check the Network tab for TrafficAI requests
4. You should see the pixel firing on page load',
  'shopify',
  2
),
(
  'manual',
  'Manual Installation',
  'Paste in HTML head',
  '## Manual Installation Guide

### Basic Installation

Add the following code to every page of your website, just before the closing `</head>` tag:

```html
<!-- TrafficAI Pixel Code -->
<script src="YOUR_PIXEL_URL" async></script>
<!-- End TrafficAI Pixel Code -->
```

### Installation Locations

The pixel code should be placed in the `<head>` section of your HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Your Website</title>
  <!-- Other meta tags and stylesheets -->

  <!-- TrafficAI Pixel Code - Place here -->
  <script src="YOUR_PIXEL_URL" async></script>

</head>
<body>
  <!-- Your content -->
</body>
</html>
```

### Single Page Applications (React, Vue, Angular)

For SPAs, add the pixel code to your main `index.html` file in the `<head>` section.

### Verification Steps

1. Open your website in a browser
2. Right-click and select "View Page Source"
3. Search for "trafficai" or your pixel ID
4. The script tag should be visible in the head section

### Troubleshooting

- **Pixel not firing?** Check if ad blockers are disabled
- **No data showing?** Wait 5-10 minutes for data to appear
- **Script errors?** Ensure the code is placed correctly in the `<head>` section',
  'code',
  3
),
(
  'gtm',
  'Google Tag Manager',
  'Add via GTM container',
  '## Google Tag Manager Installation

### Step 1: Create a New Tag

1. Log in to your Google Tag Manager account
2. Select your container
3. Click **Tags → New**
4. Name your tag "TrafficAI Pixel"

### Step 2: Configure the Tag

1. Click **Tag Configuration**
2. Select **Custom HTML**
3. Paste your TrafficAI pixel code in the HTML field
4. Check **Support document.write**

### Step 3: Set the Trigger

1. Click **Triggering**
2. Select **All Pages** trigger
3. This ensures the pixel fires on every page

### Step 4: Publish

1. Click **Save**
2. Click **Submit** in the top right
3. Add a version name like "Added TrafficAI Pixel"
4. Click **Publish**

### Verification

1. Use GTM''s **Preview** mode to test
2. Visit your website with Preview active
3. Check that the TrafficAI tag fires on page load
4. Look for successful network requests to TrafficAI servers',
  'tag',
  4
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_installation_guides_platform ON public.installation_guides(platform);
CREATE INDEX IF NOT EXISTS idx_installation_guides_active ON public.installation_guides(is_active);
