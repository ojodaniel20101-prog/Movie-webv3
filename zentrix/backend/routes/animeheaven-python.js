const express = require('express');
const { spawn } = require('child_process');
const router = express.Router();

router.get('/search', (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const python = spawn('python3', ['./routes/animeheaven_scraper.py', '--title', query, '--urls-only']);
  let output = '';
  let error = '';

  python.stdout.on('data', (data) => {
    output += data.toString();
  });

  python.stderr.on('data', (data) => {
    error += data.toString();
  });

  python.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: error || 'Script failed' });
    }
    try {
      const data = JSON.parse(output);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: 'Invalid response', output });
    }
  });
});

module.exports = router;
