import { bot } from './telegram/bot';
import { startWhatsAppServer } from './whatsapp/server';
import { config } from './core/config';
import { pool } from './core/db';

async function bootstrap() {
    console.log(`Starting Library Bot Services...`);
    console.log(`Environment: ${process.env.NODE_ENV}`);

    // 1. Check DB Connection
    try {
        const client = await pool.connect();
        const res = await client.query('SELECT NOW()');
        client.release();
        console.log(`DB Connected at ${res.rows[0].now}`);
    } catch (e) {
        console.error('Failed to connect to DB', e);
        process.exit(1);
    }

    // 2. Start WhatsApp Server (Fastify)
    // Runs on http for webhook
    startWhatsAppServer().catch(err => console.error(err));

    // 3. Start Telegram Bot (Long Polling for simplicity on Windows without SSL certs needed for webhook)
    // If webhook is preferred in production, it needs SSL. 
    // Since user asked for "Simple Deployment" and "Windows Server", Long Polling is much easier 
    // as it doesn't require exposing ports or SSL for Telegram.
    // WhatsApp DOES require a Webhook, so that port needs to be exposed/tunneled (e.g. IIS reverse proxy or simple port forward).
    
    console.log('Starting Telegram Bot...');
    bot.start({
        onStart: (botInfo) => {
            console.log(`Telegram Bot @${botInfo.username} started!`);
        },
    });

}

// Handle shutdown
process.once('SIGINT', () => {
    console.log('Stopping...');
    bot.stop();
    pool.end();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('Stopping...');
    bot.stop();
    pool.end();
    process.exit(0);
});

bootstrap();
