const Promise = require('bluebird');

const {
    getModels,
    createTable,
    dropTable,
} = require('../util');

module.exports.config = {
    transaction: true,
};

module.exports.up = async (options) => {
    const { transacting } = options;

    const models = getModels();

    await Promise.each(models, model => {
        return createTable(model.name, transacting);
    });
};

module.exports.down = async (options) => {
    const { connection } = options;

    const models = getModels().reverse();

    return Promise.each(models, model => {
        return dropTable(model.name, connection);
    });
};
