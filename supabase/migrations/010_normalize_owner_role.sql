-- Migration 010: normalize 'owner' role → 'admin'
-- Some profiles were created with role='owner' before standardization.
-- Rename to 'admin' so RBAC checks (isAdmin = role === 'admin') work correctly.

-- Temporarily drop the check constraint so we can update the value
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Rename owner → admin
UPDATE profiles SET role = 'admin' WHERE role = 'owner';

-- Re-add constraint with the correct allowed values
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staff'));
