// scripts/convertirLogo.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function convertirLogo() {
  const inputPath = path.join(__dirname, '../assets/logo.png');
  const outputPath = path.join(__dirname, '../assets/logoConv.png');

  try {
    // Verificar que existe el logo original
    if (!fs.existsSync(inputPath)) {
      console.error('❌ No se encontró logo-original.png en la carpeta assets');
      console.log('📝 Por favor, coloca tu logo como logo-original.png en la carpeta assets');
      return;
    }

    // Convertir a PNG con fondo blanco
    await sharp(inputPath)
      .resize(400, 300, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(outputPath);

    console.log('✅ Logo convertido exitosamente a:', outputPath);
    
    // Verificar tamaño
    const stats = fs.statSync(outputPath);
    console.log('📊 Tamaño del archivo:', stats.size, 'bytes');
    
  } catch (error) {
    console.error('❌ Error al convertir logo:', error);
  }
}

convertirLogo();