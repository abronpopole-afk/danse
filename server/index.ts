import express from 'express';
import path from 'path';
const app = express();
const publicPath = path.resolve('dist/public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Use Tauri invoke' });
  } else {
    res.sendFile('index.html', { root: publicPath });
  }
});
app.listen(5000, '0.0.0.0', () => console.log('Mock server running for development'));
