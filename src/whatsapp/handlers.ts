import axios from 'axios';
import { config } from '../core/config';
import { texts } from '../telegram/texts'; // Reusing texts
import { searchService, Work, Edition } from '../core/search';

// Helper
function formatEdition(e: Edition): string {
    const parts = [];
    if (e.data_edition) parts.push(`📅 Издание: ${e.data_edition}`);
    if (e.language) parts.push(`🌐 Язык: ${e.language}`);
    // if (e.placement) parts.push(`📍 Расположение: ${e.placement}`);
    if (e.index_catalogue) parts.push(`🔖 Шифр: ${e.index_catalogue}`);
    if (e.volume) parts.push(`📚 Том: ${e.volume}`);
    if (e.copy_count) parts.push(`🔢 Экз: ${e.copy_count}`);
    
    if (parts.length === 0) return `📄 #${e.id}`;
    return parts.join('\n');
}

interface UserState {
    lang: 'ru' | 'kz';
    step: 'welcome' | 'menu' | 'search_input' | 'search_results';
    lastSearch?: {
        query: string;
        offset: number;
        works: Work[];
    };
    timestamp: number;
}

// In-memory state (Note: resets on restart)
const userStates = new Map<string, UserState>();

// Cleanup old sessions every hour
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of userStates.entries()) {
        if (now - val.timestamp > 3600 * 1000 * 2) { // 2 hours
            userStates.delete(key);
        }
    }
}, 3600 * 1000); // Check every hour

async function sendWhatsAppMessage(to: string, text: string) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${config.whatsapp.phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                text: { body: text },
            },
            {
                headers: {
                    Authorization: `Bearer ${config.whatsapp.accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (e: any) {
        console.error('Error sending WhatsApp message:', e.response?.data || e.message);
    }
}

export async function verifyWebhook(req: any, reply: any) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
            console.log('WEBHOOK_VERIFIED');
            return challenge;
        } else {
            reply.code(403);
            return 'Forbidden';
        }
    }
    return 'Error';
}

export async function handleWhatsAppMessage(message: any, phoneId: string) {
    const from = message.from; // User phone number
    const text = message.text?.body?.trim();
    
    if (!text) return; // Ignore non-text messages for now

    // Update config phoneId if dynamic (optional, usually static)
    
    let state = userStates.get(from);
    
    // Initialize or Welcome
    if (!state) {
        state = { lang: 'ru', step: 'welcome', timestamp: Date.now() };
        userStates.set(from, state);
        
        const msg = `${texts.ru.welcome}\n\n1. Қазақ тілі\n2. Русский язык`;
        await sendWhatsAppMessage(from, msg);
        return;
    }
    
    state.timestamp = Date.now();

    // 1. Welcome / Lang Select
    if (state.step === 'welcome') {
        if (text === '1' || text.toLowerCase() === 'қазақ тілі') {
            state.lang = 'kz';
            state.step = 'menu';
            await sendMenu(from, state.lang);
        } else if (text === '2' || text.toLowerCase() === 'русский язык') {
            state.lang = 'ru';
            state.step = 'menu';
            await sendMenu(from, state.lang);
        } else {
            await sendWhatsAppMessage(from, "Please choose/Таңдаңыз:\n1. Қазақ тілі\n2. Русский язык");
        }
        return;
    }

    // Common navigation
    if (text === '0' || text.toLowerCase() === 'menu' || text.toLowerCase() === 'меню') {
        state.step = 'menu';
        await sendMenu(from, state.lang);
        return;
    }

    // 2. Main Menu
    if (state.step === 'menu') {
        const t = texts[state.lang];
        
        switch(text) {
            case '1': // Optional: Welcome again?
                 await sendWhatsAppMessage(from, t.welcome);
                 break;
            case '2': // Change Lang
                state.step = 'welcome';
                await sendWhatsAppMessage(from, "1. Қазақ тілі\n2. Русский язык");
                break;
            case '3': // Schedule
                await sendWhatsAppMessage(from, t.schedule);
                break;
            case '4': // Register
                await sendWhatsAppMessage(from, t.register);
                break;
            case '5': // Address
                await sendWhatsAppMessage(from, t.address);
                break;
            case '6': // Contacts
                await sendWhatsAppMessage(from, t.contacts);
                break;
            case '7': // Search
                state.step = 'search_input';
                await sendWhatsAppMessage(from, t.search_prompt);
                break;
            case '8': // Socials
                await sendWhatsAppMessage(from, t.socials);
                break;
            case '9': // Extend
                await sendWhatsAppMessage(from, t.extend);
                break;
            default:
                await sendWhatsAppMessage(from, "Choose 1-9.");
        }
        return;
    }

    // 3. Search Input
    if (state.step === 'search_input') {
        const t = texts[state.lang];
        if (text.length < 3) {
            await sendWhatsAppMessage(from, t.search_too_short);
            return;
        }
        
        await handleSearch(from, text, 0, state);
        return;
    }

    // 4. Search Results Interaction
    if (state.step === 'search_results') {
        const t = texts[state.lang];
        
        // Handle "Next" / "Назад" (simulated)
        if (text.toLowerCase() === 'd' || text.toLowerCase() === 'дальше' || text.toLowerCase() === 'next') {
            if (state.lastSearch) {
                await handleSearch(from, state.lastSearch.query, state.lastSearch.offset + 10, state);
            }
            return;
        }
        
        // Handle "Number" selection
        const num = parseInt(text);
        if (!isNaN(num) && num > 0 && num <= 10) {
            // Get edition
            if (state.lastSearch && state.lastSearch.works[num - 1]) {
                const work = state.lastSearch.works[num - 1];
                const { items: editions } = await searchService.getEditions(work.work_key);
                 let msg = `${t.show_editions} *${work.display_title}*:\n\n`;
                editions.forEach(e => {
                    msg += `📖 ${e.title}\n${formatEdition(e)}\n\n`;
                });
                await sendWhatsAppMessage(from, msg);
            } else {
                await sendWhatsAppMessage(from, "Invalid number.");
            }
            return;
        }

        // Return to menu
        if (text === '0') {
            state.step = 'menu';
            await sendMenu(from, state.lang);
        }
    }
}

async function sendMenu(to: string, lang: 'ru'|'kz') {
    const t = texts[lang];
    // TZ Order:
    // 2. Change Lang
    // 3. Schedule
    // 4. Register
    // 5. Address
    // 6. Contacts
    // 7. Search
    // 8. Socials
    // 9. Extend
    
    // We map them to 1-9 for ease of typing.
    // 1. Change Lang
    // 2. Schedule
    // 3. Register ("Как записаться")
    // 4. Address
    // 5. Contacts
    // 6. Search (Moved up? TZ says 7 is Search)
    // Let's try to match TZ numbers if possible, but user just wants "1-9" mapping.

    const msg = `Menu:
2. ${t.menu_items.change_lang}
3. ${t.menu_items.schedule}
4. ${t.menu_items.register}
5. ${t.menu_items.address}
6. ${t.menu_items.contacts}
7. ${t.menu_items.search}
8. ${t.menu_items.socials}
9. ${t.menu_items.extend}

Answer number (2-9). 0 - Main Menu.`;
    
    await sendWhatsAppMessage(to, msg);
}

async function handleSearch(to: string, query: string, offset: number, state: UserState) {
    const t = texts[state.lang];
    const { works, total } = await searchService.searchWorks(query, offset);
    
    if (works.length === 0) {
        await sendWhatsAppMessage(to, t.search_no_results);
        state.step = 'search_input'; // Stay in search mode
        return;
    }

    state.step = 'search_results';
    state.lastSearch = { query, offset, works };

    let msg = `🔎 *${query}*\n\n`;
    works.forEach((w, i) => {
        msg += `${i + 1}. *${w.display_title}* (${w.display_author}) [Издания: ${w.editions_count}]\n`;
    });
    
    msg += `\nReply with number (1-${works.length}) to see editions.\nReply 'd' for Next page.\nReply '0' for Menu.`;
    
    await sendWhatsAppMessage(to, msg);
}

