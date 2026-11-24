// Role-based access control: role -> set of permissions. Routes ask for permissions, never for role names.
const PERMISSIONS = {
  admin: ['overview:read', 'orders:read', 'orders:update', 'restaurants:read', 'schema:read', 'queries:read', 'explain:run', 'audit:read', 'users:read'],
  manager: ['overview:read', 'orders:read', 'orders:update', 'restaurants:read'],
  analyst: ['overview:read', 'orders:read', 'restaurants:read', 'schema:read', 'queries:read'],
};
const can = (role, permission) => (PERMISSIONS[role] || []).includes(permission);
module.exports = { PERMISSIONS, can };
