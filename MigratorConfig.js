const path = require('path');
const config = require('./config/local');

const dbConfig = config.datastores.MySQLServer;

module.exports = {
    database: {
        client: 'mysql',
        connection: {
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            charset: 'utf8mb4',
            collation: 'utf8mb4_unicode_ci',
            database: dbConfig.database,
        },
    },
    migrationPath: path.join(__dirname, 'migrations'),
    currentVersion: '0.1',
    subfolder: 'versions',
};
