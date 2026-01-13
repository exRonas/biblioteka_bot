import { Bot, Context, session, SessionFlavor, Keyboard, InlineKeyboard } from 'grammy';
import { config } from '../core/config';
import { texts } from './texts';
import { searchService, Edition } from '../core/search';

// Helper to format edition card
function formatEdition(e: Edition): string {
    const parts = [];
    if (e.data_edition) parts.push(`📅 Издание: ${e.data_edition}`);
    if (e.language) parts.push(`🌐 Язык: ${e.language}`);
    // if (e.placement) parts.push(`📍 Расположение: ${e.placement}`);
    if (e.index_catalogue) parts.push(`🔖 Шифр: ${e.index_catalogue}`);
    if (e.volume) parts.push(`📚 Том: ${e.volume}`);
    if (e.copy_count) parts.push(`🔢 Экз: ${e.copy_count}`);
    
    // Fallback if no details
    if (parts.length === 0) return `📄 (Детали отсутствуют) #${e.id}`;
    
    return parts.join('\n');
}

// Define session structure
interface SessionData {
  language: 'ru' | 'kz';
  state: 'idle' | 'awaiting_search';
  lastSearch?: {
    query: string;
    offset: number;
    results_count: number;
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
  return new Keyboard()
    .text(t.schedule).text(t.register).row()
    .text(t.search).text(t.extend).row()
    .text(t.address).text(t.contacts).row()
    .text(t.socials).text(t.change_lang)
    .resized();
};

const getLangKeyboard = () => {
    return new Keyboard()
        .text("Қазақ тілі").text("Русский язык")
        .resized().oneTime();
};

// --- Handlers ---

// Start
bot.command('start', async (ctx) => {
  ctx.session.state = 'idle';
  await ctx.reply(texts.ru.welcome + "\n\n" + texts.ru.choose_lang, {
    reply_markup: getLangKeyboard()
  });
});

// Language Selection
bot.hears(['Қазақ тілі', 'Русский язык'], async (ctx) => {
    const isRu = ctx.message?.text === 'Русский язык';
    ctx.session.language = isRu ? 'ru' : 'kz';
    ctx.session.state = 'idle';
    
    await ctx.reply(isRu ? "Выбран Русский язык" : "Қазақ тілі таңдалды", {
        reply_markup: getMainMenu(ctx.session.language)
    });
});

// Change Language (from menu)
bot.hears([texts.ru.menu_items.change_lang, texts.kz.menu_items.change_lang], async (ctx) => {
    await ctx.reply(texts[ctx.session.language].choose_lang, {
        reply_markup: getLangKeyboard()
    });
});

// Schedule
bot.hears([texts.ru.menu_items.schedule, texts.kz.menu_items.schedule], async (ctx) => {
    const lang = ctx.session.language;
    // Check if summer (example logic: June-August)
    const month = new Date().getMonth(); // 0-11
    const isSummer = month >= 5 && month <= 7;
    
    let text = texts[lang].schedule;
    if (isSummer) {
        text += "\n" + texts[lang].schedule_summer;
    }
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// Register
bot.hears([texts.ru.menu_items.register, texts.kz.menu_items.register], async (ctx) => {
    await ctx.reply(texts[ctx.session.language].register);
});

// Address
bot.hears([texts.ru.menu_items.address, texts.kz.menu_items.address], async (ctx) => {
    await ctx.reply(texts[ctx.session.language].address);
});

// Contacts
bot.hears([texts.ru.menu_items.contacts, texts.kz.menu_items.contacts], async (ctx) => {
    await ctx.reply(texts[ctx.session.language].contacts);
});

// Socials
bot.hears([texts.ru.menu_items.socials, texts.kz.menu_items.socials], async (ctx) => {
    await ctx.reply(texts[ctx.session.language].socials, { link_preview_options: { is_disabled: true } });
});

// Extend
bot.hears([texts.ru.menu_items.extend, texts.kz.menu_items.extend], async (ctx) => {
    await ctx.reply(texts[ctx.session.language].extend);
});

// Search Trigger
bot.hears([texts.ru.menu_items.search, texts.kz.menu_items.search], async (ctx) => {
    ctx.session.state = 'awaiting_search';
    await ctx.reply(texts[ctx.session.language].search_prompt);
});

// Handle Search Query (Text messages when state is awaiting_search)
bot.on('message:text', async (ctx) => {
    if (ctx.session.state !== 'awaiting_search') return;
    
    // Ignore menu commands if somehow they leak here, but `hears` usually catches them first.
    // However, grammy matching order matters. If `hears` is registered before, it runs.
    // We should allow "Back" if we had a back button, but we use Main Menu.
    // If user clicks a menu button, we want to exit search mode.
    const text = ctx.message.text;
    const t = texts[ctx.session.language];
    
    // Check if it matches any main menu item to cancel search
    const menuValues = Object.values(t.menu_items);
    if (menuValues.includes(text)) {
        // It's a menu command, let it bubble up or handle?
        // Actually `bot.on` catches everything. We need to be careful.
        // A better pattern is to use a filter or router.
        // For simplicity: check if it looks like a menu item.
        ctx.session.state = 'idle';
        // Re-emit or just reply? Re-emitting is hard. 
        // Let's just say "Search mode cancelled" and let them click again or handle it here.
        // But since we have `bot.hears` above, and they are registered BEFORE this `bot.on`, 
        // the `hears` middleware SHOULD catch it if `next()` is not called.
        // So this handler only runs if no specific header matched.
        // Perfect.
    }

    if (text.length < 3) {
        return ctx.reply(t.search_too_short);
    }

    await handleSearch(ctx, text, 0);
});

async function handleSearch(ctx: MyContext, query: string, offset: number) {
    const lang = ctx.session.language;
    const t = texts[lang];
    
    try {
        const { works, total } = await searchService.searchWorks(query, offset);
        
        ctx.session.lastSearch = { query, offset, results_count: works.length };

        if (works.length === 0) {
            if (ctx.callbackQuery) {
                return ctx.answerCallbackQuery(t.search_no_results);
            }
            return ctx.reply(t.search_no_results);
        }

        // Construct message
        let msg = `🔎 *${query}*\n\n`;
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
             navRow.text(`⬅️ ${t.back}`, `search_page:${query}:${Math.max(0, offset - 10)}`);
        }
        // Assuming limit 10. If we got 10 items, likely there is a next page.
        // Ideally we check total, but this is a simple heuristic.
        if (works.length === 10) { 
             navRow.text(`${t.next} ➡️`, `search_page:${query}:${offset + 10}`);
        }

        row.row(); 
        row.append(navRow); 

        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            // Edit existing message
            // We must use editMessageText
             await ctx.editMessageText(msg, { 
                parse_mode: 'Markdown',
                reply_markup: row 
            });
        } else {
            // Send new message
            await ctx.reply(msg, { 
                parse_mode: 'Markdown',
                reply_markup: row 
            });
        }

    } catch (e) {
        console.error(e);
        if (ctx.callbackQuery) await ctx.answerCallbackQuery("Error");
        else await ctx.reply("Error processing search.");
    }
}

// Callback Query Handler
bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const lang = ctx.session.language;
    const t = texts[lang];

    if (data.startsWith('search_page:')) {
        const parts = data.split(':');
        // Handle potential colons in query? Query is 2nd part.
        // search_page:query:offset
        // But what if query has ':'?
        // Better to use state or safe split.
        // Let's assume query is everything between index 1 and last index.
        const offset = parseInt(parts[parts.length - 1]);
        const query = parts.slice(1, parts.length - 1).join(':');
        
        await handleSearch(ctx, query, offset);
        await ctx.answerCallbackQuery();
    } 
    else if (data.startsWith('view_work:')) {
        const parts = data.split(':');
        const workKey = parts[1];
        // Parse explicitly
        const offset = parts.length > 2 ? parseInt(parts[2]) : 0;

        // Use safe defaults if parse failed
        const safeOffset = isNaN(offset) ? 0 : offset;

        const { items: editions, total } = await searchService.getEditions(workKey, safeOffset);
        
        let msg = `${t.show_editions} (Total: ${total}):\n\n`;
        editions.forEach(e => {
            msg += `📖 *${e.title}*\n${formatEdition(e)}\n\n`;
        });
        
        const kb = new InlineKeyboard();

        // Pagination for editions
        const navRow = new InlineKeyboard();
        if (safeOffset > 0) {
             // Prev
             navRow.text(`⬅️`, `view_work:${workKey}:${Math.max(0, safeOffset - 10)}`);
        }
        if (safeOffset + 10 < total) {
             // Next
             navRow.text(`➡️`, `view_work:${workKey}:${safeOffset + 10}`);
        }
        kb.append(navRow);
        kb.row();

        // Add "Back to List" button
        // Recovery logic: if session is lost (restart), try to parse from message text
        let recoveredQuery: string | undefined;
        let recoveredOffset: number = 0;

        if (ctx.session.lastSearch) {
             recoveredQuery = ctx.session.lastSearch.query;
             recoveredOffset = ctx.session.lastSearch.offset;
        } else if (ctx.callbackQuery && ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) {
             // Attempt recovery from message text
             // Format: "🔎 Query\n\n11. Title..."
             const text = ctx.callbackQuery.message.text || '';
             const lines = text.split('\n');
             if (lines.length > 0 && lines[0].startsWith('🔎 ')) {
                 recoveredQuery = lines[0].substring(3).trim(); // Remove "🔎 "
                 
                 // Find first numbered line to guess offset
                 for (const line of lines) {
                     const match = line.match(/^(\d+)\./);
                     if (match) {
                         recoveredOffset = Math.max(0, parseInt(match[1]) - 1);
                         break;
                     }
                 }
                 // Store back to session for next interactions
                 ctx.session.lastSearch = { query: recoveredQuery, offset: recoveredOffset, results_count: 0 };
             }
        }

        if (recoveredQuery) {
             kb.text(`⬅️ ${t.back}`, `search_page:${recoveredQuery}:${recoveredOffset}`);
        }

        await ctx.editMessageText(msg, { 
            parse_mode: 'Markdown',
            reply_markup: kb 
        });
        await ctx.answerCallbackQuery();
    }
});

// Error handling
bot.catch((err) => {
    console.error('Bot error:', err);
});
