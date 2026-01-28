import express from 'express';
const app = express();
app.use(express.static('dist'));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Use Tauri invoke' });
  } else {
    res.sendFile('index.html', { root: 'dist' });
  }
});
app.listen(5000, '0.0.0.0', () => console.log('Mock server running for development'));
