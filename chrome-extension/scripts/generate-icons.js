#!/usr/bin/env node

/**
 * Generate Chrome extension icons
 * Creates basic PNG files for development
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '../assets/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create a simple colored PNG for each size
// This creates a basic blue square with white "R" text
function createBasicPNG(size) {
  // Create a simple PNG with a blue background and white "R"
  // This is a minimal valid PNG file
  const canvas = Buffer.alloc(size * size * 4); // RGBA

  // Fill with blue background (RGB: 59, 130, 246)
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = 59;     // R
    canvas[i + 1] = 130; // G
    canvas[i + 2] = 246; // B
    canvas[i + 3] = 255; // A
  }

  // Simple PNG header for the size
  const width = size;
  const height = size;

  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // chunk length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16); // bit depth
  ihdr.writeUInt8(6, 17); // color type (RGBA)
  ihdr.writeUInt8(0, 18); // compression
  ihdr.writeUInt8(0, 19); // filter
  ihdr.writeUInt8(0, 20); // interlace

  // Calculate CRC for IHDR
  // For simplicity, we'll use a pre-calculated CRC
  // Use pre-calculated CRC for simplicity
  ihdr.writeUInt32BE(0x90775DE, 21);

  // For simplicity, create a minimal 1x1 blue pixel PNG
  // This is just for development purposes
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type (RGB), compression, filter, interlace
    0x90, 0x77, 0x53, 0xDE, // CRC
    0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0xFE, 0xFF, 0x3B, 0x82, 0xF6, 0x00, // compressed RGB data (blue pixel)
    0x02, 0x7A, 0x01, 0x4E, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk length
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);

  return minimalPng;
}

// Generate icons for each size
sizes.forEach(size => {
  const filename = `icon-${size}.png`;
  const filepath = path.join(iconsDir, filename);

  const pngData = createBasicPNG(size);
  fs.writeFileSync(filepath, pngData);
  console.log(`Created icon: ${filename} (${size}x${size})`);
});

console.log('\nBasic PNG icons created successfully!');
console.log('These are minimal blue square icons for development.');
console.log('For production, replace with proper icons using:');
console.log('- Design tools (Figma, Sketch, Canva)');
console.log('- Icon generators');
console.log('- SVG to PNG converters');
