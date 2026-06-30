const express = require('express');
const { spawn } = require('child_process');
const router = express.Router();

router.get('/search', (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const python = spawn('python3', ['./animeheaven-wrapper.py', 'search', query]);
  let output = '';

  python.stdout.on('data', (data) => {
    output += data.toString();
  });

  python.on('close', () => {
    try {
      res.json(JSON.parse(output));
    } catch (e) {
      res.status(500).json({ error: 'Invalid response' });
    }
  });
});

router.get('/episodes', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'ID required' });

  const python = spawn('python3', ['./animeheaven-wrapper.py', 'episodes', id]);
  let output = '';

  python.stdout.on('data', (data) => {
    output += data.toString();
  });

  python.on('close', () => {
    try {
      res.json(JSON.parse(output));
    } catch (e) {
      res.status(500).json({ error: 'Invalid response' });
    }
  });
});

router.get('/stream', (req, res) => {
  const animeId = req.query.animeId;
  const epNumber = req.query.epNumber;
  const epId = req.query.epId;

  const python = spawn('python3', ['./animeheaven-wrapper.py', 'stream', animeId, epNumber, epId]);
  let output = '';

  python.stdout.on('data', (data) => {
    output += data.toString();
  });

  python.on('close', () => {
    try {
      res.json(JSON.parse(output));
    } catch (e) {
      res.status(500).json({ error: 'Invalid response' });
    }
  });
});

module.exports = router;
