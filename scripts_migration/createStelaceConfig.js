/* global BootstrapService */

const Sails = require('sails');

global._       = require('lodash');
global.Promise = require('bluebird');

const {
    StelaceConfig,
} = require('../api/models_new');

Sails.load({
    models: {
        migrate: "safe"
    },
    hooks: {
        grunt: false,
        sockets: false,
        pubsub: false,
        orm: false,
    }
}, async function (err, sails) {
    if (err) {
        console.log("\n!!! Fail script launch: can't load sails");
        return;
    }

    BootstrapService.init(null, { sails: sails });

    try {
        const stelaceConfigs = await StelaceConfig.find().limit(1);

        const attrs = {
            config: {
                SERVICE_NAME: 'Stelace',
            },
            features: {
                GAMIFICATION: true,
                TAGS: true,
                EVENTS: true,
                SOCIAL_LOGIN: true,
                INCOME_REPORT: true,
                SMS: true,
                MAP: true,
            },
        };

        if (stelaceConfigs.length) {
            await StelaceConfig.findByIdAndUpdate(stelaceConfigs[0].id, attrs, { new: true });
        } else {
            await StelaceConfig.create(attrs);
        }
    } catch (err) {
        console.log(err);

        if (err.stack) {
            console.log(err.stack);
        }
    } finally {
        sails.lowerSafe();
    }

});
