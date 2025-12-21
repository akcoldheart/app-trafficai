-- RBAC Tables Migration
-- Creates roles, menu_items, and role_permissions tables

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create menu_items table
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  href VARCHAR(255) NOT NULL,
  icon VARCHAR(50) NOT NULL,
  display_order INTEGER DEFAULT 0,
  parent_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(role_id, menu_item_id)
);

-- Add role_id column to users table (keeping old role column for migration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_order ON menu_items(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(is_active);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_menu ON role_permissions(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- Enable Row Level Security
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roles table
-- All authenticated users can read roles
CREATE POLICY "roles_select_authenticated" ON roles
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert/update/delete roles
CREATE POLICY "roles_insert_admin" ON roles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "roles_update_admin" ON roles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "roles_delete_admin" ON roles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- RLS Policies for menu_items table
-- All authenticated users can read menu items
CREATE POLICY "menu_items_select_authenticated" ON menu_items
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can modify menu items
CREATE POLICY "menu_items_insert_admin" ON menu_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "menu_items_update_admin" ON menu_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "menu_items_delete_admin" ON menu_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- RLS Policies for role_permissions table
-- All authenticated users can read role permissions
CREATE POLICY "role_permissions_select_authenticated" ON role_permissions
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can modify role permissions
CREATE POLICY "role_permissions_insert_admin" ON role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "role_permissions_update_admin" ON role_permissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "role_permissions_delete_admin" ON role_permissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
