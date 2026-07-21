const express = require('express');
const axios = require('axios');
const router = express.Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = 'https://zen-strean.name.ng/api/telegram/webhook';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'zentrix_webhook_secret';
const API_BASE = 'https://zen-strean.name.ng/api';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tgCall(method, payload = {}) {
  try {
    const { data } = await axios.post(`${TELEGRAM_API}/${method}`, payload, { timeout: 15000 });
    return data;
  } catch (err) {
    console.error(`Telegram API failed (${method}):`, err.message);
    return { ok: false };
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

router.post('/webhook', async (req, res) => {
  res.status(200).json({ ok: true });
  const update = req.body;
  if (!update) return;

  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat?.id;
    await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
    if (cb.data === 'sports') await handleMatches(chatId);
    else if (cb.data === 'live_tv') await handleLive(chatId);
    else if (cb.data === 'help') await handleHelp(chatId);
    return;
  }

  if (!update.message?.text) return;
  const chatId = update.message.chat.id;
  const text = update.message.text.trim();
  const user = update.message.from;
  const cmd = text.split(' ')[0].replace('/', '').replace(`@zenstream_bot`, '').toLowerCase();

  if (cmd === 'start') await handleStart(chatId, user);
  else if (cmd === 'matches') await handleMatches(chatId);
  else if (cmd === 'live') await handleLive(chatId);
  else if (cmd === 'link') await handleLink(chatId, user.id);
  else if (cmd === 'help') await handleHelp(chatId);
  else await sendMessage(chatId, 'Unknown command. Use /help to see available commands.');
});

async function handleStart(chatId, user) {
  await sendMessage(chatId,
    `👋 <b>Welcome to Zentrix, ${user.first_name || 'there'}!</b>\n\n` +
    `Stream everything. Anywhere. Anytime.\n\n` +
    `<b>Commands:</b>\n` +
    `/matches - Live and upcoming sports\n` +
    `/live - Live TV channels\n` +
    `/link - Link your account\n` +
    `/help - All commands\n\n` +
    `🌐 <a href="https://zen-strean.name.ng">Visit Zentrix</a>`,
    { reply_markup: { inline_keyboard: [[
      { text: '🌐 Visit Site', url: 'https://zen-strean.name.ng' },
      { text: '⚽ Matches', callback_data: 'sports' }
    ], [
      { text: '📺 Live TV', callback_data: 'live_tv' },
      { text: '❓ Help', callback_data: 'help' }
    ]]}}
  );
}

async function handleMatches(chatId) {
  try {
    const { data } = await axios.get(`${API_BASE}/sports-v2/matches?leagueId=0`, { timeout: 10000 });
    const matches = data.data?.list || [];
    const live = matches.filter(m => m.status === 'LIVE').slice(0, 5);
    const upcoming = matches.filter(m => m.status === 'UPCOMING').slice(0, 5);
    let msg = '⚽ <b>Sports Update</b>\n\n';
    if (live.length) {
      msg += '🔴 <b>LIVE NOW</b>\n';
      live.forEach(m => { msg += `• ${m.team1?.name} <b>${m.team1?.score ?? 0}-${m.team2?.score ?? 0}</b> ${m.team2?.name}\n`; });
      msg += '\n';
    }
    if (upcoming.length) {
      msg += '🕐 <b>UPCOMING</b>\n';
      upcoming.forEach(m => {
        const time = m.startTime ? new Date(Number(m.startTime)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'TBD';
        msg += `• ${m.team1?.name} vs ${m.team2?.name} — ${time}\n`;
      });
    }
    if (!live.length && !upcoming.length) msg += 'No matches right now.';
    msg += `\n🌐 <a href="https://zen-strean.name.ng/sports">Watch Live</a>`;
    await sendMessage(chatId, msg);
  } catch (e) {
    await sendMessage(chatId, 'Could not fetch matches. Try again later.');
  }
}

async function handleLive(chatId) {
  await sendMessage(chatId,
    '📺 <b>Live TV</b>\n\nBrowse 41+ channels including Kids, Sports, News and Entertainment.\n\n' +
    '🌐 <a href="https://zen-strean.name.ng/live">Watch Live TV</a>'
  );
}

async function handleLink(chatId, userId) {
  await sendMessage(chatId,
    '🔗 <b>Link Your Zentrix Account</b>\n\n' +
    'Visit your profile and connect your Telegram:\n' +
    '🌐 <a href="https://zen-strean.name.ng/profile">zen-strean.name.ng/profile</a>\n\n' +
    `Your Telegram ID: <code>${userId}</code>`
  );
}

async function handleHelp(chatId) {
  await sendMessage(chatId,
    '📖 <b>Zentrix Bot Commands</b>\n\n' +
    '/start — Welcome message\n' +
    '/matches — Live and upcoming sports\n' +
    '/live — Live TV channels\n' +
    '/link — Link your Zentrix account\n' +
    '/help — Show this message\n\n' +
    '🌐 <a href="https://zen-strean.name.ng">Visit Zentrix</a>'
  );
}

router.get('/set-webhook', async (req, res) => {
  await tgCall('deleteWebhook', { drop_pending_updates: true });
  const result = await tgCall('setWebhook', { url: WEBHOOK_URL, allowed_updates: ['message', 'callback_query'] });
  res.json(result);
});

router.get('/status', async (req, res) => {
  const result = await tgCall('getWebhookInfo');
  res.json(result);
});

if (process.env.NODE_ENV === 'production' && BOT_TOKEN) {
  setTimeout(async () => {
    await tgCall('deleteWebhook', { drop_pending_updates: true });
    await tgCall('setWebhook', { url: WEBHOOK_URL, allowed_updates: ['message', 'callback_query'] });
    console.log('Telegram webhook set');
  }, 3000);
}

module.exports = router;
