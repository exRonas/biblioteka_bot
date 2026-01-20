import crypto from 'crypto';

export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  
  // 1. Lowercase
  let normalized = text.toLowerCase();
  
  // 2. Replace 'ё' with 'е'
  normalized = normalized.replace(/ё/g, 'е');
  
  // 3. Remove punctuation and special characters (including commas for search insensitivity)
  normalized = normalized.replace(/[^\w\sа-яәіңғүұқөһ]/gi, ' '); // Keeps only letters and digits. Commas are replaced by space.
  
  // 4. Remove extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // 5. Remove common "noise" words for grouping (optional but recommended in TZ)
  // Words like: том, часть, издание, выпуск - might split the same work into different keys if present/absent
  // We remove them only if we want very aggressive grouping. 
  // For now, let's keep it safer: just clean string. 
  // If "War and Peace Vol 1" vs "War and Peace", they are strictly different physical books, 
  // but logically same work? Maybe not. Vol 1 is Vol 1.
  // The TZ says: "аккуратно чистить слова вроде “том/часть/издание” (не ломая смысл)"
  // Let's remove "изд.", "издание" as they refer to the physical copy, not the content.
  
  const stopWords = ['изд', 'издание', 'баспасы', 'publ', 'publishing'];
  stopWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, '');
  });

  return normalized.trim();
}

export function generateWorkKey(author: string | null, title: string | null): string {
  const normAuthor = normalizeText(author || '');
  const normTitle = normalizeText(title || '');
  
  // Create a combined string
  const combined = `${normAuthor}|${normTitle}`;
  
  // MD5 Hash
  return crypto.createHash('md5').update(combined).digest('hex');
}
