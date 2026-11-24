const app = require('./src/app');
const { port } = require('./src/config');
const users = require('./src/auth/users');

const server = app.listen(port, () => {
  console.log(`Zomato Ops backend running at http://localhost:${port}`);
  console.log('Demo accounts:'); users.demoAccounts.forEach((u) => console.log(`  ${u.role.padEnd(8)} ${u.email}  ${u.password}`));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
