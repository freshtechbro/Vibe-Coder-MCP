@echo off
echo Fixing Sharp module for Windows...

echo 1. Installing Sharp with proper Windows support...
npm install --platform=win32 --arch=x64 sharp

echo 2. Installing Sharp for the transformers dependency...
cd node_modules\@xenova\transformers
npm install --platform=win32 --arch=x64 sharp
cd ..\..\..

echo 3. Rebuilding the project...
npm run build

echo Sharp fix complete! Try running the server again.
pause
