import { db } from '../src/core/db';

async function run() {
  try {
    const l4 = await db.query('SELECT title, author FROM ebook WHERE b_level_id = 4 LIMIT 5');
    console.log('Level 4:', l4.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

run();