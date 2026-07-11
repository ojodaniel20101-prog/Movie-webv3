/**
 * Sports Live Route — Python Scraper Proxy
 * Wraps sports_grabber_v3.py and returns JSON with match data & stream URLs.
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

// GET /api/sports/live/live
router.get('/live', (req, res) => {
  const scriptPath = path.join(__dirname, 'sports_grabber_v3.py');
  const python = spawn('python3', [scriptPath, '--json']);
  let output = '';
  let error = '';

  python.stdout.on('data', (data) => {
    output += data.toString();
  });

  python.stderr.on('data', (data) => {
    error += data.toString();
  });

  python.on('close', (code) => {
    if (code !== 0 && !output) {
      return res.status(500).json({
        success: false,
        error: error || 'Python scraper failed',
        note: 'Ensure Python 3 and requests library are installed',
      });
    }

    try {
      // Try to parse JSON output
      const lines = output.trim().split('\n');
      let jsonData = null;

      // Find the last JSON line
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{')) {
          try {
            jsonData = JSON.parse(line);
            break;
          } catch {
            continue;
          }
        }
      }

      if (jsonData) {
        return res.json({
          success: true,
          ...jsonData,
        });
      }

      // Fallback: return raw output
      res.json({
        success: true,
        rawOutput: output,
        note: 'Python scraper ran but returned non-JSON output',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message,
        rawOutput: output,
      });
    }
  });
});

module.exports = router;
