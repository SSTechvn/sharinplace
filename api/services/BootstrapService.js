/* global ErrorService, MangopayService, MicroService, OdooApiService */

module.exports = {

    init: init,

};

var moment                  = require('moment');
var areIntlLocalesSupported = require('intl-locales-supported');
var IntlPolyfill            = require('intl');

const mongoose = require('mongoose');
const Promise = require('bluebird');

mongoose.Promise = Promise;

let mongoConnected = false;

const initMongoose = () => {
    if (mongoConnected) return;

    const mongoConfig = sails.config.connections.MongoDB;

    const options = { useMongoClient: true };
    if (process.env.NODE_ENV === 'production' || ! mongoConfig.autoIndex) {
        options.autoIndex = false;
    }

    const connectionQuery = `mongodb://${mongoConfig.host}/${mongoConfig.database}`;
    if (mongoConfig.user) {
        options.auth = {
            user: mongoConfig.user,
            password: mongoConfig.password,
        };
    }

    mongoose.connect(connectionQuery, options);

    mongoConnected = true;
};

function init(initFields, args) {
    var defaultFields = [
        "uncaughtException",
        "errors",
        "mongo",
        "mangopay",
        "utilities",
        "useProxy",
        "odoo",
        "lowerSafe",
        "intl"
    ];
    args = args || {};
    initFields = initFields || defaultFields;

    _.forEach(initFields, function (field) {
        switch (field) {
            case "uncaughtException":
                process.on("uncaughtException", function (err) {
                    console.log(new Date(), err);
                    console.log(err.stack);
                });
                break;

            case "errors":
                ErrorService.init();
                break;

            case "mongo":
                initMongoose();
                break;

            case "mangopay":
                var mangopayConfig    = sails.config.mangopay;
                var mangopayWorkspace = mangopayConfig[mangopayConfig.workspace];
                global.mangopay = new MangopayService.getSingleton({
                    username: mangopayWorkspace.clientId,
                    password: mangopayWorkspace.passphrase,
                    production: mangopayConfig.workspace === "production"
                });
                break;

            case "utilities":
                global.µ = MicroService;
                moment.locale("fr");
                break;

            case "intl":
                // Node supports only english locale by default
                var localesToSupport        = [
                    "fr-FR"
                ];

                if (global.Intl) {
                    // Determine if the built-in `Intl` has the locale data needed
                    if (! areIntlLocalesSupported(localesToSupport)) {
                        // Intl exists, but it doesn't have the data we need, so load the
                        // polyfill and patch the constructors we need with the polyfill's.
                        Intl.NumberFormat   = IntlPolyfill.NumberFormat;
                        Intl.DateTimeFormat = IntlPolyfill.DateTimeFormat;
                    }
                } else {
                    // No Intl, so use and load the polyfill.
                    global.Intl = IntlPolyfill;
                }
                break;

            case "useProxy":
                if (sails.config.useProxy) {
                    sails.hooks.http.app.set("trust proxy", true);
                }
                break;

            case "passport":
                sails.services.passport.loadStrategies();
                break;

            case "odoo":
                var odooConnection = sails.config.odoo.connection;
                global.odoo = OdooApiService.getInstance({
                    protocol: odooConnection.protocol,
                    host: odooConnection.host,
                    port: odooConnection.port,
                    database: odooConnection.database,
                    username: odooConnection.username,
                    password: odooConnection.password
                });
                break;

            case "lowerSafe":
                // hack because process isn't killed (node 0.10.36 / sails 0.11.0)
                args.sails.lowerSafe = function (cb) {
                    args.sails.lower(function () {
                        if (cb) {
                            cb();
                        }
                        setTimeout(function () {
                            process.exit();
                        }, 1000);
                    });
                };
                break;
        }
    });
}

