import { db } from '../src/core/db';

async function run() {
  try {
    const res = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ebook'
    `);
    console.log('Columns:', res.rows.map(r => r.column_name));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

run();