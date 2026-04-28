const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')
const destDir = path.join(__dirname, '..', 'web', 'leaflet')

if (!fs.existsSync(srcDir)) {
  console.log('Leaflet not installed yet, skipping copy.')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })

const files = ['leaflet.js', 'leaflet.css', 'images']

for (const file of files) {
  const src = path.join(srcDir, file)
  const dest = path.join(destDir, file)
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true })
  } else {
    fs.copyFileSync(src, dest)
  }
}

console.log('✓ Leaflet copiato in web/leaflet/')
