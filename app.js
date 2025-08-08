const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.set('trust proxy', 1);
app.use(cors({ origin: '*' }));

// Dimensión máxima en píxeles de la imagen (lado más largo)
const MAX_DIMENSION = 600;

app.get('/curucucha', (req, res) => {
  res.status(200).json({ message: 'Despiértate y anda' });
});

app.post('/compress-image-batch', async (req, res) => {
  const data = req.body;
  let quality = parseInt(data.quality || '80');
  let urlsArray = data.arr;
  let dataToResponse = [];

  for (let url of urlsArray) {
    try {
      console.log(`Processing: ${url} (Calidad: ${quality})`);

      const response = await axios({
        url: url,
        responseType: 'arraybuffer',
        timeout: 10000, // 10 segundos de timeout para la descarga
      });
      const originalImageBuffer = Buffer.from(response.data);
      let processedImageBuffer;
      let contentType =
        response.headers['content-type'] || 'application/octet-stream';

      const metadata = await sharp(originalImageBuffer).metadata();
      const { width, height, format } = metadata;

      if (format === 'gif' && metadata.pages > 1) {
        console.log(
          `[Processing GIF] ${url}. Solo redimensionará si es necesario.`
        );
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          let resizeOptions = {};
          if (width > height) {
            resizeOptions.width = MAX_DIMENSION;
          } else {
            resizeOptions.height = MAX_DIMENSION;
          }
          processedImageBuffer = await sharp(originalImageBuffer)
            .resize(resizeOptions)
            .gif()
            .toBuffer();
          console.log(
            `[Processing GIF] GIF animado redimensionado a ${
              resizeOptions.width || 'auto'
            }x${resizeOptions.height || 'auto'}.`
          );
        } else {
          processedImageBuffer = originalImageBuffer;
          console.log(
            `[Processing GIF] GIF animado no necesita redimensionamiento.`
          );
        }
        contentType = 'image/gif';
      } else {
        let transformer = sharp(originalImageBuffer);

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          let resizeOptions = {};
          if (width > height) {
            resizeOptions.width = MAX_DIMENSION;
          } else {
            resizeOptions.height = MAX_DIMENSION;
          }
          transformer = transformer.resize(resizeOptions);
          console.log(
            `[Processing] Imagen redimensionada a ${
              resizeOptions.width || 'auto'
            }x${resizeOptions.height || 'auto'}.`
          );
        }

        const urlLower = url.toLowerCase();
        if (urlLower.endsWith('.png') || contentType.includes('image/png')) {
          processedImageBuffer = await transformer
            .webp({ quality: quality })
            .toBuffer();
          contentType = 'image/webp';
        } else if (
          urlLower.endsWith('.jpg') ||
          urlLower.endsWith('.jpeg') ||
          contentType.includes('image/jpeg')
        ) {
          processedImageBuffer = await transformer
            .jpeg({ quality: quality, progressive: true })
            .toBuffer();
          contentType = 'image/jpeg';
        } else if (
          urlLower.endsWith('.gif') ||
          contentType.includes('image/gif')
        ) {
          processedImageBuffer = await transformer
            .webp({ quality: quality })
            .toBuffer();
          contentType = 'image/webp';
        } else if (
          urlLower.endsWith('.webp') ||
          contentType.includes('image/webp')
        ) {
          processedImageBuffer = await transformer
            .webp({ quality: quality })
            .toBuffer();
          contentType = 'image/webp';
        } else if (
          urlLower.endsWith('.svg') ||
          contentType.includes('image/svg')
        ) {
          processedImageBuffer = originalImageBuffer;
          contentType = 'image/svg+xml';
        } else {
          console.warn(
            `[Warning] Formato de imagen no soportado para compresión/redimensionamiento: ${url}. Devolviendo original.`
          );
        }
      }
      let obj = {
        base64URL: `data:${contentType};base64,${processedImageBuffer.toString(
          'base64'
        )}`,
        url: url,
      };
      dataToResponse.push(obj);
    } catch (error) {
      console.error(
        `[Error Processing] Error al procesar imagen ${url}:`,
        error.message
      );
    }
  }
  res.status(200).json(dataToResponse);
});

app.get('/compress-image', async (req, res) => {
  const imageUrl = req.query.url;
  // Leer la calidad, por defecto 80
  let quality = parseInt(req.query.quality || '80');

  if (!imageUrl) {
    console.error('[Error] URL de imagen no proporcionada.');
    return res.status(400).send('URL de imagen no proporcionada.');
  }

  // Validación básica de la URL
  try {
    new URL(imageUrl);
  } catch (e) {
    console.error(`[Error] URL inválida: ${imageUrl}`, e.message);
    return res.status(400).send('URL de imagen inválida.');
  }

  // Asegurar que la calidad esté en un rango válido
  if (quality < 1 || quality > 100) {
    console.warn(
      `[Warning] Calidad fuera de rango (${quality}) para ${imageUrl}. Usando 80.`
    );
    quality = 80;
  }

  try {
    console.log(
      `[Processing] Descargando y procesando: ${imageUrl} (Calidad: ${quality})`
    );

    const response = await axios({
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 10000, // 10 segundos de timeout para la descarga
    });
    const originalImageBuffer = Buffer.from(response.data);

    const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (originalImageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
      console.warn(
        `[Warning] Imagen demasiado grande (${(
          originalImageBuffer.length /
          (1024 * 1024)
        ).toFixed(2)}MB) para ${imageUrl}. Devolviendo original.`
      );
      res.set(
        'Content-Type',
        response.headers['content-type'] || 'application/octet-stream'
      );
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); // No cachear en el cliente tampoco
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      return res.send(originalImageBuffer); // Devolver la original sin procesar
    }

    let processedImageBuffer;
    let contentType =
      response.headers['content-type'] || 'application/octet-stream';

    const metadata = await sharp(originalImageBuffer).metadata();
    const { width, height, format } = metadata;

    if (format === 'gif' && metadata.pages > 1) {
      console.log(
        `[Processing GIF] GIF animado detectado para: ${imageUrl}. Solo redimensionará si es necesario.`
      );
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        let resizeOptions = {};
        if (width > height) {
          resizeOptions.width = MAX_DIMENSION;
        } else {
          resizeOptions.height = MAX_DIMENSION;
        }
        processedImageBuffer = await sharp(originalImageBuffer)
          .resize(resizeOptions)
          .gif()
          .toBuffer();
        console.log(
          `[Processing GIF] GIF animado redimensionado a ${
            resizeOptions.width || 'auto'
          }x${resizeOptions.height || 'auto'}.`
        );
      } else {
        processedImageBuffer = originalImageBuffer;
        console.log(
          `[Processing GIF] GIF animado no necesita redimensionamiento.`
        );
      }
      contentType = 'image/gif';
    } else {
      let transformer = sharp(originalImageBuffer);

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        let resizeOptions = {};
        if (width > height) {
          resizeOptions.width = MAX_DIMENSION;
        } else {
          resizeOptions.height = MAX_DIMENSION;
        }
        transformer = transformer.resize(resizeOptions);
        console.log(
          `[Processing] Imagen redimensionada a ${
            resizeOptions.width || 'auto'
          }x${resizeOptions.height || 'auto'}.`
        );
      }

      const urlLower = imageUrl.toLowerCase();
      if (urlLower.endsWith('.png') || contentType.includes('image/png')) {
        processedImageBuffer = await transformer
          .webp({ quality: quality })
          .toBuffer();
        contentType = 'image/webp';
      } else if (
        urlLower.endsWith('.jpg') ||
        urlLower.endsWith('.jpeg') ||
        contentType.includes('image/jpeg')
      ) {
        processedImageBuffer = await transformer
          .jpeg({ quality: quality, progressive: true })
          .toBuffer();
        contentType = 'image/jpeg';
      } else if (
        urlLower.endsWith('.gif') ||
        contentType.includes('image/gif')
      ) {
        processedImageBuffer = await transformer
          .webp({ quality: quality })
          .toBuffer();
        contentType = 'image/webp';
      } else if (
        urlLower.endsWith('.webp') ||
        contentType.includes('image/webp')
      ) {
        processedImageBuffer = await transformer
          .webp({ quality: quality })
          .toBuffer();
        contentType = 'image/webp';
      } else if (
        urlLower.endsWith('.svg') ||
        contentType.includes('image/svg')
      ) {
        processedImageBuffer = originalImageBuffer;
        contentType = 'image/svg+xml';
      } else {
        console.warn(
          `[Warning] Formato de imagen no soportado para compresión/redimensionamiento: ${imageUrl}. Devolviendo original.`
        );
        processedImageBuffer = originalImageBuffer;
        contentType =
          response.headers['content-type'] || 'application/octet-stream';
      }
    }

    // No almacenamos en caché
    res.set('Content-Type', contentType);
    // Indicamos a los proxies y navegadores que no cacheen esta respuesta
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(processedImageBuffer);
  } catch (error) {
    console.error(
      `[Error Processing] Error al procesar imagen ${imageUrl}:`,
      error.message
    );
    // En caso de error, redirigir a la URL de la imagen original como fallback
    res.redirect(imageUrl);
  }
});

app.listen(PORT, () => console.log(`Servidor corriendo en puerto: ${PORT}`));
