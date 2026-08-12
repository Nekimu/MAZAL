/**
 * MAZAL POS & ERP - Production Web Server for Railway & Cloud Hosting
 */
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable gzip compression for lightning fast page loads
app.use(compression());

// Healthcheck endpoint for Railway / load balancers
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    app: 'MAZAL POS & ERP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Determine static files directory (supports root dist or mazal/dist)
let staticDir = path.join(__dirname, 'mazal', 'dist');
if (!fs.existsSync(staticDir)) {
  staticDir = path.join(__dirname, 'dist');
}
if (!fs.existsSync(staticDir)) {
  staticDir = __dirname; // fallback
}

console.log(`[MAZAL POS Server] Sirviendo archivos estáticos desde: ${staticDir}`);
app.use(express.static(staticDir, {
  maxAge: '1d',
  etag: true
}));

// SPA Fallback: route all unrecognized URLs to index.html
app.get('*', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('MAZAL POS: La compilación del frontend no se encuentra. Ejecuta npm run build.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🚀 MAZAL POS & ERP SERVIDOR ACTIVO EN LÍNEA`);
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL Local: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
