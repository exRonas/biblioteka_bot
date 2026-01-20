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
  // placement?: string | null; // Removed in favor of locations
  locations?: string[]; // Array of department names
  index_catalogue?: string | null;
  volume?: string | null;
  copy_count?: string | null;
}

export const searchService = {
  /**
   * Search for distinct works (grouped editions)
   */
  async searchWorks(query: string, offset = 0, limit = 10, mode: 'all' | 'title' | 'author' = 'all'): Promise<{ works: Work[], total: number }> {
    const normalizedQuery = normalizeText(query);
    if (normalizedQuery.length < 3) {
      return { works: [], total: 0 };
    }

    let whereClause = '';
    let params: any[] = [];
    
    if (mode === 'all') {
        const tsQuery = normalizedQuery.split(' ').filter(w => w).join(' & ') + ':*';
        whereClause = `search_tsv @@ to_tsquery('russian', $1) AND b_level_id != 5`;
        params = [tsQuery, limit, offset];
    } else if (mode === 'title') {
        // Use ILIKE for specific field search
        // We use normalizedQuery to ignore punctuation as requested
        whereClause = `${config.columns.title} ILIKE $1 AND b_level_id != 5`;
        params = [`%${normalizedQuery}%`, limit, offset];
    } else if (mode === 'author') {
        whereClause = `${config.columns.author} ILIKE $1 AND b_level_id != 5`;
        params = [`%${normalizedQuery}%`, limit, offset];
    }

    // Safer optimized query without full grouping total:
     const sqlWithCount = `
      WITH matched_works AS (
        SELECT 
          work_key,
          ${config.columns.title} as title,
          ${config.columns.author} as author
          ${mode === 'all' ? `, ts_rank(search_tsv, to_tsquery('russian', $1)) as rank` : ', 1 as rank'}
        FROM ebook
        WHERE ${whereClause}
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
      const res = await db.query(sqlWithCount, params);
      return { works: res.rows, total: 100 }; 
    } catch (e) {
      console.error('Search error:', e);
      return { works: [], total: 0 };
    }
  },

  /**
   * Get aggregated location statistics for a work
   */
  async getWorkLocationStats(workKey: string): Promise<string> {
    const sql = `
      SELECT
        v.lib_depart_name
      FROM ebook e
      JOIN view_ebook_inv v ON v.ebook_id = e.id
      WHERE e.work_key = $1
      GROUP BY v.lib_depart_name
      ORDER BY v.lib_depart_name
    `;
    
    try {
      const res = await db.query(sql, [workKey]);
      if (res.rows.length === 0) return '';
      
      const parts = res.rows.map(row => row.lib_depart_name);
      return parts.join(', ');
    } catch (e) {
      console.error('Get location stats error:', e);
      return '';
    }
  },

  /**
   * Get all editions for a specific work key
   */
  async getEditions(workKey: string, offset = 0, limit = 10): Promise<{ items: Edition[], total: number }> {
    // Basic ordering by ID usually implies recency in insertion.
    // If there is an ID column, use it. ID is standard.
    // We get unique department names per edition, without counts.
    const sql = `
      SELECT 
        e.*, 
        count(*) OVER() as full_count,
        (
          SELECT array_agg(DISTINCT v.lib_depart_name)
          FROM view_ebook_inv v
          WHERE v.ebook_id = e.id
        ) as location_details
      FROM ebook e
      WHERE e.work_key = $1
      ORDER BY e.id DESC
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
            // placement: row[config.columns.placement] || null, // Removed
            locations: row.location_details || [],
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

