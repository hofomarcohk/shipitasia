pm2 stop vw_wms
git pull
cp .env.prod .env
npm install
npm run build
pm2 start