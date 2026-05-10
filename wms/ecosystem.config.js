module.exports = {
    apps: [{
        name: "vw_wms",
        time: true,
        script: "npm start",
        env: {
            NODE_ENV: "development",
            PORT: 3001,
            HOSTNAME: "0.0.0.0"
        },
        env_production: {
            NODE_ENV: "production",
            PORT: 3001,
            HOSTNAME: "0.0.0.0"
        },
        log_file: "./logs/combined.log",
        error_file: "./logs/error.log",
        out_file: "./logs/output.log",
        max_size: "10M",
        retain: "10",
        merge_logs: true,
    }]
}