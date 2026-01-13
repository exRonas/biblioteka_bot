import { pool, db } from '../src/core/db';
import { generateWorkKey, normalizeText } from '../src/core/normalization';
import { config } from '../src/core/config';

const BATCH_SIZE = 1000;

async function run() {
  console.log('Starting data filling...');
  
  try {
    const totalRes = await db.query('SELECT COUNT(*) FROM ebook');
    const total = parseInt(totalRes.rows[0].count);
    console.log(`Total rows to process: ${total}`);

    let processed = 0;
    
    // Using a cursor approach or offset loop. 
    // Since we are updating, offset might shift if order changes, but simple ID iteration is best.
    // Assuming there is an 'id' column. If not, we use CTAID or simple OFFSET.
    // Let's use OFFSET for generic support if keys are unknown, though strictly less efficient.
    
    // Better: Select rows where work_key IS NULL
    while (true) {
        const rows = await db.query(`
            SELECT id, ${config.columns.title} as title, ${config.columns.author} as author 
            FROM ebook 
            WHERE work_key IS NULL 
            LIMIT $1
        `, [BATCH_SIZE]);

        if (rows.rows.length === 0) {
            break;
        }

        const updates = rows.rows.map(row => {
            const title = row.title || '';
            const author = row.author || '';
            const titleNorm = normalizeText(title);
            const authorNorm = normalizeText(author);
            const workKey = generateWorkKey(author, title);
            
            // Preparing TSVECTOR string: 'normalized_words'
            // We concatenate title + author. 
            // In SQL update we can use to_tsvector, but passing prepared text is also fine if we want custom control.
            // Let's rely on SQL update for tsvector to keep it consistent with DB locale.
            
            return {
                id: row.id,
                titleNorm,
                authorNorm,
                workKey,
                rawText: `${title} ${author}`
            };
        });

        // Batch update? Postgres doesn't have native easy massive batch update in node-pg without complex query building.
        // We can do it in a transaction.
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            for (const item of updates) {
                await client.query(`
                    UPDATE ebook 
                    SET 
                        work_key = $1, 
                        title_norm = $2, 
                        author_norm = $3,
                        search_tsv = to_tsvector('russian', $4)
                    WHERE id = $5
                `, [item.workKey, item.titleNorm, item.authorNorm, item.rawText, item.id]);
            }
            
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        processed += rows.rows.length;
        console.log(`Processed ${processed}/${total}`);
    }

    console.log('Done!');
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
