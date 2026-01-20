import { Bot, Context, session, SessionFlavor, Keyboard, InlineKeyboard } from 'grammy';
import { config } from '../core/config';
import { texts } from './texts';
import { searchService, Edition } from '../core/search';

// Helper to format edition card
function formatEdition(e: Edition): string {
    const parts = [];
    if (e.data_edition) parts.push(`📅 Издание: ${e.data_edition}`);
    if (e.language) parts.push(`🌐 Язык: ${e.language}`);
    
    // Updated Location Mapping from aggregations
    if (e.locations && e.locations.length > 0) {
        // e.locations is an array of department strings e.g. ["Абонемент", "ЧЗ"]
        parts.push(`📍 Расположение: ${e.locations.join(', ')}`);
    }

    if (e.index_catalogue) parts.push(`🔖 Шифр: ${e.index_catalogue}`);
    // if (e.volume) parts.push(`📚 Том: ${e.volume}`); // Removed by request
    if (e.copy_count) parts.push(`🔢 Экз: ${e.copy_count}`);
    
    // Fallback if no details
    if (parts.length === 0) return `📄 (Детали отсутствуют) #${e.id}`;
    
    return parts.join('\n');
}

// Define session structure
interface SessionData {
  language: 'ru' | 'kz';
  state: 'idle' | 'awaiting_search' | 'awaiting_search_title' | 'awaiting_search_author';
  lastBotMessageId?: number; // To track the ID for editing
  lastSearch?: {
    query: string;
    offset: number;
    results_count: number;
    mode: 'all' | 'title' | 'author';
  };
}

type MyContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<MyContext>(config.telegram.token);

// Middleware
bot.use(session({
  initial: (): SessionData => ({ language: 'ru', state: 'idle' }),
}));

// Keyboards
const getMainMenu = (lang: 'ru' | 'kz') => {
  const t = texts[lang].menu_items;
  // Use InlineKeyboard for single-window experience
  return new InlineKeyboard()
    .text(t.schedule, 'menu:schedule').text(t.register, 'menu:register').row()
    .text(t.search, 'menu:search').text(t.extend, 'menu:extend').row()
    .text(t.address, 'menu:address').text(t.contacts, 'menu:contacts').row()
    .text(t.socials, 'menu:socials').text(t.change_lang, 'menu:change_lang');
};

const getLangKeyboard = () => {
    // Inline keyboard for language selection
    return new InlineKeyboard()
        .text("Қазақ тілі", "lang:kz").text("Русский язык", "lang:ru");
};

// Helper to safely reply or edit
async function safeReplyOrEdit(ctx: MyContext, text: string, extra: any = {}) {
    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
             // We are reacting to a button click, so edit the message
             await ctx.editMessageText(text, { ...extra, parse_mode: 'Markdown' });
             ctx.session.lastBotMessageId = ctx.callbackQuery.message.message_id;
        } else if (ctx.session.lastBotMessageId) {
             // We have a stored message ID, try to edit it
             try {
                 await ctx.api.editMessageText(ctx.chat!.id, ctx.session.lastBotMessageId, text, { ...extra, parse_mode: 'Markdown' });
             } catch (e) {
                 // Editing failed (maybe message too old or deleted), send new one
                 const msg = await ctx.reply(text, { ...extra, parse_mode: 'Markdown' });
                 ctx.session.lastBotMessageId = msg.message_id;
             }
        } else {
             // Fallback: send new message
             const msg = await ctx.reply(text, { ...extra, parse_mode: 'Markdown' });
             ctx.session.lastBotMessageId = msg.message_id;
        }
    } catch (e) {
        console.error('SafeReply Error', e);
        // Last resort
        const msg = await ctx.reply(text, { ...extra, parse_mode: 'Markdown' });
        ctx.session.lastBotMessageId = msg.message_id;
    }
}

// --- Handlers ---

// Start
bot.command('start', async (ctx) => {
  ctx.session.state = 'idle';
  const msg = await ctx.reply(texts.ru.welcome + "\n\n" + texts.ru.choose_lang, {
    reply_markup: getLangKeyboard()
  });
  ctx.session.lastBotMessageId = msg.message_id;
});

// Language Selection (via Callback)
bot.callbackQuery(['lang:ru', 'lang:kz'], async (ctx) => {
    const isRu = ctx.callbackQuery.data === 'lang:ru';
    ctx.session.language = isRu ? 'ru' : 'kz';
    ctx.session.state = 'idle';
    
    await safeReplyOrEdit(ctx, isRu ? "Выбран Русский язык" : "Қазақ тілі таңдалды", {
        reply_markup: getMainMenu(ctx.session.language)
    });
    await ctx.answerCallbackQuery();
});

// Generic Menu Handler
bot.callbackQuery(/^menu:/, async (ctx) => {
    const action = ctx.callbackQuery.data.split(':')[1];
    const lang = ctx.session.language;
    const t = texts[lang];

    // Handle "Back to Menu" logic if we are deep in structure
    // But since this is a menu click, we are at root.

    switch (action) {
        case 'change_lang':
            await safeReplyOrEdit(ctx, texts[lang].choose_lang, {
                reply_markup: getLangKeyboard()
            });
            break;
        case 'schedule':
            const month = new Date().getMonth(); 
            const isSummer = month >= 5 && month <= 7;
            let sched = t.schedule;
            if (isSummer) sched += "\n" + t.schedule_summer;
            // Add back button
            await safeReplyOrEdit(ctx, sched, {
                reply_markup: new InlineKeyboard().text(t.back, 'menu:main') // Add 'menu:main' handler below
            });
            break;
        case 'register':
            await safeReplyOrEdit(ctx, t.register, { reply_markup: new InlineKeyboard().text(t.back, 'menu:main') });
            break;
        case 'address':
            await safeReplyOrEdit(ctx, t.address, { reply_markup: new InlineKeyboard().text(t.back, 'menu:main') });
            break;
        case 'contacts':
            await safeReplyOrEdit(ctx, t.contacts, { reply_markup: new InlineKeyboard().text(t.back, 'menu:main') });
            break;
        case 'socials':
            // Link preview options not supported in editMessageText usually, but let's try
            // Actually visuals might be better if we send link? 
            // Stick to edit.
            await safeReplyOrEdit(ctx, t.socials, { reply_markup: new InlineKeyboard().text(t.back, 'menu:main') });
            break;
        case 'extend':
            await safeReplyOrEdit(ctx, t.extend, { reply_markup: new InlineKeyboard().text(t.back, 'menu:main') });
            break;
        case 'search':
             // Show search mode selection
            const k = new InlineKeyboard()
                .text(t.btn_search_title, 'mode:title')
                .text(t.btn_search_author, 'mode:author')
                .row().text(t.back, 'menu:main');
            
            await safeReplyOrEdit(ctx, t.search_mode_prompt, { reply_markup: k });
            break;
        case 'main':
             ctx.session.state = 'idle';
             await safeReplyOrEdit(ctx, t.choose_lang, { // Reusing welcome text or just menu text?
                 reply_markup: getMainMenu(lang)
             });
             break;
    }
    await ctx.answerCallbackQuery();
});


// Handle Search Query (Text messages when state is awaiting_search)
bot.on('message:text', async (ctx) => {
    // Try to delete user message to keep chat clean
    try {
        await ctx.deleteMessage();
    } catch (e) {
        // Ignored, maybe no permission
    }

    // Check states
    if (!['awaiting_search', 'awaiting_search_title', 'awaiting_search_author'].includes(ctx.session.state)) return;
    
    // Check strict commands
    if (ctx.message.text === '/start') {
        // Reset
        return bot.handleUpdate(ctx.update); // Reprocess as command? No, just run start logic manually.
        // Actually best to let it fall through or handle manually.
        // If we deleted message, it's gone.
    }

    const text = ctx.message.text;
    const t = texts[ctx.session.language];
    
    if (text.length < 3) {
        // Show error for 3 sec then restore? Or just edit.
        await safeReplyOrEdit(ctx, t.search_too_short);
        return;
    }

    // Determine mode based on state
    let mode: 'all' | 'title' | 'author' = 'all';
    if (ctx.session.state === 'awaiting_search_title') mode = 'title';
    if (ctx.session.state === 'awaiting_search_author') mode = 'author';

    await handleSearch(ctx, text, 0, mode);
});

async function handleSearch(ctx: MyContext, query: string, offset: number, mode: 'all' | 'title' | 'author' = 'all') {
    const lang = ctx.session.language;
    const t = texts[lang];
    
    try {
        const { works } = await searchService.searchWorks(query, offset, 10, mode);
        
        ctx.session.lastSearch = { query, offset, results_count: works.length, mode };

        if (works.length === 0) {
             const kb = new InlineKeyboard().text(t.back, 'menu:search');
             await safeReplyOrEdit(ctx, t.search_no_results, { reply_markup: kb });
             return;
        }

        // Construct message
        let msg = `🔎 *${query}* (${mode === 'title' ? t.btn_search_title : mode === 'author' ? t.btn_search_author : 'All'})\n\n`;
        works.forEach((w, i) => {
            msg += `${offset + i + 1}. *${w.display_title}*\n👤 ${w.display_author}\n📚 Издания: ${w.editions_count}\n\n`;
        });

        const row = new InlineKeyboard();
        // Number buttons
        works.forEach((w, i) => {
             row.text(`${offset + i + 1}`, `view_work:${w.work_key}`);
             if ((i + 1) % 5 === 0) row.row();
        });
        
        // Navigation buttons
        const navRow = new InlineKeyboard();
        if (offset > 0) {
             navRow.text(`⬅️ ${t.back}`, `search_page:${mode}:${query}:${Math.max(0, offset - 10)}`);
        }
        // Assuming limit 10
        if (works.length === 10) { 
             navRow.text(`${t.next} ➡️`, `search_page:${mode}:${query}:${offset + 10}`);
        }

        row.row(); 
        row.append(navRow); 
        // Add "Menu" button to exit search
        row.row().text(t.back, 'menu:search');

        await safeReplyOrEdit(ctx, msg, { reply_markup: row });

    } catch (e) {
        console.error(e);
        await safeReplyOrEdit(ctx, "Error processing search.");
    }
}

// Callback Query Handler: Data
bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const lang = ctx.session.language;
    const t = texts[lang];

    // Skip menu handlers handled above
    if (data.startsWith('lang:') || data.startsWith('menu:')) return; 

    if (data.startsWith('mode:')) {
        const mode = data.split(':')[1];
        // Add Back button to prompt
        const kb = new InlineKeyboard().text(t.back, 'menu:search');

        if (mode === 'title') {
            ctx.session.state = 'awaiting_search_title';
            await safeReplyOrEdit(ctx, t.prompt_enter_title, { reply_markup: kb });
        } else if (mode === 'author') {
            ctx.session.state = 'awaiting_search_author';
            await safeReplyOrEdit(ctx, t.prompt_enter_author, { reply_markup: kb });
        }
    }
    else if (data.startsWith('search_page:')) {
        const parts = data.split(':');
        const mode = parts[1] as 'all' | 'title' | 'author';
        const offset = parseInt(parts[parts.length - 1]);
        const query = parts.slice(2, parts.length - 1).join(':');
        
        await handleSearch(ctx, query, offset, mode);
        await ctx.answerCallbackQuery();
    } 
    else if (data.startsWith('view_work:')) {
        const parts = data.split(':');
        const workKey = parts[1];
        const offset = parts.length > 2 ? parseInt(parts[2]) : 0;
        const safeOffset = isNaN(offset) ? 0 : offset;

        // Fetch aggregated location stats for the header
        const locationStats = await searchService.getWorkLocationStats(workKey);
        const { items: editions, total } = await searchService.getEditions(workKey, safeOffset);
        
        // Header with aggregated locations
        let msg = `${t.show_editions} (${t.total_count}: ${total}):\n`;
        if (locationStats) {
            msg += `🏢 Места хранения: ${locationStats}\n`;
        }
        msg += `\n`;

        editions.forEach(e => {
            msg += `📖 *${e.title}*\n${formatEdition(e)}\n\n`;
        });
        
        const kb = new InlineKeyboard();

        // Pagination for editions
        const navRow = new InlineKeyboard();
        if (safeOffset > 0) {
             navRow.text(`⬅️`, `view_work:${workKey}:${Math.max(0, safeOffset - 10)}`);
        }
        if (safeOffset + 10 < total) {
             navRow.text(`➡️`, `view_work:${workKey}:${safeOffset + 10}`);
        }
        kb.append(navRow);
        kb.row();

        // Recovery logic simplified: use session if possible, else we are stuck unless we parse.
        // But since we are editing same message, session should persist in memory usually? 
        // Actually session is per-user-chat.
        // If restarting bot, memory session is lost.
        // But we added parsing logic previously.
        
        if (ctx.session.lastSearch) {
             const { query, offset: searchOffset, mode } = ctx.session.lastSearch;
             kb.text(`⬅️ ${t.back}`, `search_page:${mode}:${query}:${searchOffset}`);
        }

        await ctx.editMessageText(msg, { 
            parse_mode: 'Markdown',
            reply_markup: kb 
        });
        ctx.session.lastBotMessageId = ctx.callbackQuery.message?.message_id;
        await ctx.answerCallbackQuery();
    }
});

// Error handling
bot.catch((err) => {
    console.error('Bot error:', err);
});
