import { db } from '../src/core/db';

async function run() {
  try {
    const resLevel = await db.query('SELECT b_level_id, COUNT(*) FROM ebook GROUP BY b_level_id');
    console.log('b_level_id stats:', resLevel.rows);

    const resType = await db.query('SELECT type_descr_id, COUNT(*) FROM ebook GROUP BY type_descr_id');
    console.log('type_descr_id stats:', resType.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

run();