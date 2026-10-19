// Makes a STAFF account (the people who scan tickets at the door).
// Staff cannot sign up on the website, on purpose, so an organizer runs this on the server:
//   npm run make-staff -- "Ngozi Door" ngozi@example.com a-long-password
import { fileURLToPath } from "node:url";
import { createSqliteStore } from "../src/data/sqliteStore.js";
import { hashPassword, checkSignup } from "../src/auth.js";

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error('Usage: npm run make-staff -- "Full Name" email@example.com password-of-8-or-more-characters');
  process.exit(1);
}
try {
  // checkSignup checks the name, email and password. It refuses role "staff", so we check as an attendee, then make the staff account.
  const clean = checkSignup({ name, email, password, role: "attendee" });
  const dbFile = process.env.DB_FILE || fileURLToPath(new URL("../data/tickets.sqlite", import.meta.url));
  const store = createSqliteStore(dbFile);
  store.users.create({ name: clean.name, email: clean.email, passwordHash: await hashPassword(clean.password), role: "staff" });
  store.close();
  console.log(`Staff account made for ${clean.email}. They can log in on the website and open "Door".`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
