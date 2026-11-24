const bcrypt = require('bcryptjs');
const { PERMISSIONS } = require('./rbac');

// Demo user store. A real system would keep these in a users table; the evaluation focus is the request pipeline.
// Passwords are stored only as bcrypt hashes. cityId is a data-scope: a manager only sees and changes orders in that city.
const COST = 10;
const seed = [
  { id: 1, email: 'admin@zomato.test', role: 'admin', cityId: null, password: process.env.DEMO_ADMIN_PASSWORD || 'Admin@12345', name: 'Platform Admin' },
  { id: 2, email: 'manager.blr@zomato.test', role: 'manager', cityId: 1, password: process.env.DEMO_MANAGER_PASSWORD || 'Manager@12345', name: 'Bengaluru City Manager' },
  { id: 3, email: 'analyst@zomato.test', role: 'analyst', cityId: null, password: process.env.DEMO_ANALYST_PASSWORD || 'Analyst@12345', name: 'Read-only Analyst' },
];
const users = seed.map(({ password, ...u }) => ({ ...u, passwordHash: bcrypt.hashSync(password, COST), active: true }));

// Compared against when the email is unknown, so "no such user" and "wrong password" cost the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const publicView = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, cityId: u.cityId, permissions: PERMISSIONS[u.role] });
module.exports = {
  findByEmail: (email) => users.find((u) => u.email === String(email).toLowerCase()),
  findById: (id) => users.find((u) => u.id === id && u.active),
  list: () => users.map(publicView),
  publicView, DUMMY_HASH,
  demoAccounts: seed.map((s) => ({ email: s.email, role: s.role, password: s.password })),
};
