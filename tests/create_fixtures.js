import fs from 'fs';
import path from 'path';

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

// Valid 100x100 high-contrast PNG with multiple feature shapes/lines
// Generated base64 for a 64x64 patterned target PNG image
const highContrastPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5gMDFR8mY/X3aAAAAFRJREFUeN7t1LEJACAMBEBBsnR27s/nI6xSC9tAMuQOvLhXAgAAAAAAAABgu6v0tN/VzN7u7T3L7u4zO3v29u7tPTt79vaurq6urq6urq6urq6urq6uro7u2T0lXQ3mAAAAAElFTkSuQmCC';

fs.writeFileSync(path.join(fixturesDir, 'test_target.png'), Buffer.from(highContrastPngBase64, 'base64'));

// Write minimal mp4 video binary
const mp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAsbWRhdA==';
fs.writeFileSync(path.join(fixturesDir, 'test_video.mp4'), Buffer.from(mp4Base64, 'base64'));

console.log('Fixtures created in tests/fixtures/');
