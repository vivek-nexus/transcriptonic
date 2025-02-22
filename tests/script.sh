chromium --remote-debugging-port=21222 &
cd transcriptonic/tests/ && npx jest --runInBand monitoring.test.js
read
