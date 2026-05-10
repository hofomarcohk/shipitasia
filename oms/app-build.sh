pm2 stop vw_shipping
git pull
cp .env.prod .env
npm install
npm run build
pm2 start