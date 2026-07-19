const express = require('express');
const router = express.Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function getFetch() {
  return (await import('node-fetch')).default;
}

async function sendMessage(chatId, text) {
  const fetch = await getFetch();
  await fetch(`${BASE_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

router.post('/webhook', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.sendStatus(200);
  const chatId = message.chat.id;
  const text = message.text || '';
  const firstName = message.from.first_name || 'User';
  const userId = message.from.id;

  if (text === '/start') {
    await sendMessage(chatId,
      `👋 <b>Welcome to Zentrix, ${firstName}!</b>\n\n` +
      `Stream everything. Anywhere. Anytime.\n\n` +
      `<b>Commands:</b>\n` +
      `/matches - Live and upcoming matches\n` +
      `/new - What is new on Zentrix\n` +
      `/link - Link your Zentrix account\n` +
      `/help - Show all commands\n\n` +
      `Visit: <a href="https://zen-strean.name.ng">zen-strean.name.ng</a>`
    );
  } else if (text === '/matches') {
    try {
      const fetch = await getFetch();
      const r = await fetch('https://zen-strean.name.ng/api/sports-v2/matches?leagueId=0');
      const data = await r.json();
      const matches = data.data?.list || [];
      const live = matches.filter(m => m.status === 'LIVE');
      const upcoming = matches.filter(m => m.status === 'UPCOMING').slice(0, 5);
      let msg = 'SPORTS UPDATE\n\n';
      if (live.length > 0) {
        msg += 'LIVE NOW\n';
        live.forEach(m => {
          msg += `${m.team1?.name} ${m.team1?.score ?? 0} - ${m.team2?.score ?? 0} ${m.team2?.name}\n`;
        });
        msg += '\n';
      }
      if (upcoming.length > 0) {
        msg += 'UPCOMING\n';
        upcoming.forEach(m => {
          const time = m.startTime ? new Date(Number(m.startTime)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'TBD';
          msg += `${m.team1?.name} vs ${m.team2?.name} - ${time}\n`;
        });
      }
      if (!live.length && !upcoming.length) msg += 'No matches right now.';
      msg += '\nWatch live: https://zen-strean.name.ng/sports';
      await sendMessage(chatId, msg);
    } catch (e) {
      await sendMessage(chatId, 'Could not fetch matches right now. Try again later.');
    }
  } else if (text === '/new') {
    await sendMessage(chatId,
      'NEW ON ZENTRIX\n\n' +
      'Movies and series added daily\n' +
      'Anime episodes updated automatically\n' +
      '41+ Live TV channels\n' +
      'Live sports with real-time scores\n\n' +
      'Visit: https://zen-strean.name.ng'
    );
  } else if (text === '/link') {
    await sendMessage(chatId,
      'LINK YOUR ACCOUNT\n\n' +
      'Visit your profile and tap Connect Telegram:\n' +
      'https://zen-strean.name.ng/profile\n\n' +
      `Your Telegram ID: <code>${userId}</code>`
    );
  } else if (text === '/help') {
    await sendMessage(chatId,
      'ZENTRIX BOT COMMANDS\n\n' +
      '/start - Welcome message\n' +
      '/matches - Live and upcoming sports\n' +
      '/new - What is new on Zentrix\n' +
      '/link - Link your Zentrix account\n' +
      '/help - Show this message'
    );
  } else {
    await sendMessage(chatId, 'Type /help to see available commands.');
  }

  res.sendStatus(200);
});

router.get('/set-webhook', async (req, res) => {
  const fetch = await getFetch();
  const webhookUrl = `https://zen-strean.name.ng/api/telegram/webhook`;
  const resp = await fetch(`${BASE_URL}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
  const data = await resp.json();
  res.json(data);
});

module.exports = router;
