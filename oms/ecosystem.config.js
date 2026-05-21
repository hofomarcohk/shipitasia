module.exports = {
    apps: [
        {
            name: "vw_shipping",
            script: "npm start",
            time: true,
            env: {
                NODE_ENV: "development",
                PORT: 3000,
                HOSTNAME: "0.0.0.0"
            },
            env_production: {
                NODE_ENV: "production",
                PORT: 3000,
                HOSTNAME: "0.0.0.0"
            }
        },
        // P17 — node-cron driver. Hits /api/cron/* on the vw_shipping
        // app above, so it must be running. CRON_SECRET should match
        // the value vw_shipping reads from .env.
        {
            name: "vw_shipping_cron",
            script: "scripts/cron.mjs",
            time: true,
            autorestart: true,
            env: {
                NODE_ENV: "development",
                CRON_BASE_URL: "http://localhost:3000"
            },
            env_production: {
                NODE_ENV: "production",
                CRON_BASE_URL: "http://localhost:3000"
            }
        }
    ]
}
