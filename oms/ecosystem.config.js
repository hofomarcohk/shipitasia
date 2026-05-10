module.exports = {
    apps: [{
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
    }]
}