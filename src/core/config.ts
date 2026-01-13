import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'secret',
    database: process.env.DB_NAME || 'biblioteka',
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  whatsapp: {
    verifyToken: process.env.WA_VERIFY_TOKEN || '',
    accessToken: process.env.WA_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || '',
  },
  columns: {
    title: process.env.COL_TITLE || 'title',
    author: process.env.COL_AUTHOR || 'author',
    // Optional fields for editions view
    data_edition: process.env.COL_DATA_EDITION || 'data_edition',
    language: process.env.COL_LANGUAGE || 'language',
    placement: process.env.COL_PLACEMENT || 'placement',
    index_catalogue: process.env.COL_INDEX_CATALOGUE || 'index_catalogue',
    volume: process.env.COL_VOLUME || 'volume', // or volume_number
    copy_count: process.env.COL_COPY_COUNT || 'copy_count',
  }
};


