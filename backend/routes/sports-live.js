const express = require('express');
const { spawn } = require('child_process');
const router = express.Router();

router.get('/live', (req, res) => {
  const python = spawn('python3', ['./routes/sports_grabber_v3.py']);
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
    // Parse output and extract Channel 1 stream (Primary HD)
    const streamMatch = output.match(/https:\/\/live-pull\.aisports\.mobi\/moviebox\/[^\s]+/);
    const channelMatch = output.match(/https:\/\/www\.rtmpcdn\.com\/live\/migu1\.m3u8/);
    
    const primaryStream = streamMatch ? streamMatch[0] : null;
    const channel1Stream = channelMatch ? channelMatch[0] : null;

    res.json({
      success: true,
      primaryStream: primaryStream,
      channel1Stream: channel1Stream,
      rawOutput: output
    });
  });
});

module.exports = router;
