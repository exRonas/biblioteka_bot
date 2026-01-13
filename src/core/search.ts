import { db } from './db';
import { config } from './config';
import { normalizeText } from './normalization';

const LANGUAGE_MAP: Record<string | number, string> = {
  503: 'Русский',
  501: 'Казахский',
  504: 'Английский',
  521: 'Арабский (религиозные тексты)',
};

export interface Work {
  work_key: string;
  display_title: string;
  display_author: string;
  editions_count: number;
}

export interface Edition {
  id: number | string;
  title: string;
  author: string;
  // Extended fields
  data_edition?: string | null;
  language?: string | null;
  placement?: string | null;
  index_catalogue?: string | null;
  volume?: string | null;
  copy_count?: string | null;
}

export const searchService = {
  /**
   * Search for distinct works (grouped editions)
   */
  async searchWorks(query: string, offset = 0, limit = 10): Promise<{ works: Work[], total: number }> {
    const normalizedQuery = normalizeText(query);
    if (normalizedQuery.length < 3) {
      return { works: [], total: 0 };
    }

    const tsQuery = normalizedQuery.split(' ').filter(w => w).join(' & ') + ':*'; // Prefix search

    // Safer optimized query without full grouping total:
     const sqlWithCount = `
      WITH matched_works AS (
        SELECT 
          work_key,
          ${config.columns.title} as title,
          ${config.columns.author} as author,
          ts_rank(search_tsv, to_tsquery('russian', $1)) as rank
        FROM ebook
        WHERE search_tsv @@ to_tsquery('russian', $1)
      )
      SELECT 
        work_key,
        MAX(title) as display_title,
        MAX(author) as display_author,
        COUNT(*) as editions_count,
        MAX(rank) as max_rank
      FROM matched_works
      GROUP BY work_key
      ORDER BY max_rank DESC, editions_count DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const res = await db.query(sqlWithCount, [tsQuery, limit, offset]);
      return { works: res.rows, total: 100 }; 
    } catch (e) {
      console.error('Search error:', e);
      return { works: [], total: 0 };
    }
  },

  /**
   * Get all editions for a specific work key
   */
  async getEditions(workKey: string, offset = 0, limit = 10): Promise<{ items: Edition[], total: number }> {
    // Basic ordering by ID usually implies recency in insertion.
    // If there is an ID column, use it. ID is standard.
    const sql = `
      SELECT *, count(*) OVER() as full_count
      FROM ebook
      WHERE work_key = $1
      ORDER BY id DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const res = await db.query(sql, [workKey, limit, offset]);
      const items = res.rows.map(row => {
          const langCode = row[config.columns.language];
          // Use map or fallback to raw code if present
          const langStr = LANGUAGE_MAP[langCode] || (langCode ? String(langCode) : null);

          return {
            id: row.id, 
            title: row[config.columns.title] || '',
            author: row[config.columns.author] || '',
            
            data_edition: row[config.columns.data_edition] || null,
            language: langStr,
            placement: row[config.columns.placement] || null,
            index_catalogue: row[config.columns.index_catalogue] || null,
            volume: row[config.columns.volume] || null,
            copy_count: row[config.columns.copy_count] || null
          };
      });

      const total = res.rows.length > 0 ? parseInt(res.rows[0].full_count) : 0;
      return { items, total };

    } catch (e) {
      console.error('Get editions error:', e);
      return { items: [], total: 0 };
    }
  }
};

