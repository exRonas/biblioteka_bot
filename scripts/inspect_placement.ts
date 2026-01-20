import { db } from '../src/core/db';

async function run() {
  try {
    const res = await db.query('SELECT placement, COUNT(*) FROM ebook GROUP BY placement ORDER BY count DESC LIMIT 20');
    console.log('Placement stats:', res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

run();