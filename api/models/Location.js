/* global Location, MathService, ModelSnapshot */

/**
* Location.js
*
* @description :: TODO: You might write a short summary of how this model works and what it represents here.
* @docs        :: http://sailsjs.org/#!documentation/models
*/

module.exports = {

    attributes: {
        id: {
            type: 'number',
            columnType: 'int',
            autoIncrement: true,
        },
        createdDate: {
            type: 'string',
            columnType: 'varchar(255)',
            maxLength: 255,
        },
        updatedDate: {
            type: 'string',
            columnType: 'varchar(255)',
            maxLength: 255,
        },
        name: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        alias: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        streetNum: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        street: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        postalCode: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        city: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        department: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        region: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        latitude: {
            type: 'number',
            columnType: 'float',
            allowNull: true,
        },
        longitude: {
            type: 'number',
            columnType: 'float',
            allowNull: true,
        },
        main: { // a user can only have one main location at a time
            type: 'boolean',
            columnType: 'tinyint(1)',
            defaultsTo: false,
        },
        transportMode: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        userId: {
            type: 'number',
            columnType: 'int',
            allowNull: true,
            // index: true,
        },
        establishment: {
            type: 'boolean',
            columnType: 'tinyint(1)',
            defaultsTo: false,
        },
        establishmentName: { // prevents from exposing name to others
            type: 'string',
            columnType: 'varchar(255) CHARACTER SET utf8mb4',
            allowNull: true,
            maxLength: 255,
        },
        provider: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        remoteId: { // location id from map providers (for ex: 'place_id' for google map)
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
    },

    postBeforeCreate: postBeforeCreate,
    postBeforeUpdate: postBeforeUpdate,
    getAccessFields: getAccessFields,
    get: get,
    getAddress: getAddress,
    getBillingLocation: getBillingLocation,
    getMainLocationSnapshot: getMainLocationSnapshot,
    hasUserLocations,
};

var params = {
    transportModes: ["car", "publicTransport"],
    providers: ["google"], // ["google", "nominatim"]
    gpsCoordsDecimal: 6
};

const _ = require('lodash');
const Promise = require('bluebird');

function getAccessFields(access) {
    var accessFields = {
        self: [
            "id",
            "name",
            "alias",
            "streetNum",
            "street",
            "postalCode",
            "city",
            "department",
            "region",
            "latitude",
            "longitude",
            "main",
            "transportMode",
            "userId",
            "establishment",
            "establishmentName",
            "provider",
            "remoteId"
        ],
        others: [
            "id",
            "street",
            "postalCode",
            "city",
            "department",
            "region",
            "latitude",
            "longitude",
            "main",
            "userId",
            "establishment",
            "establishmentName"
        ]
    };

    return accessFields[access];
}

function get(prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
}

function postBeforeCreate(values) {
    var gpsCoordsDecimal = Location.get("gpsCoordsDecimal");

    if (values.alias === "") {
        values.alias = null;
    }
    if (values.latitude) {
        values.latitude = MathService.roundDecimal(values.latitude, gpsCoordsDecimal);
    }
    if (values.longitude) {
        values.longitude = MathService.roundDecimal(values.longitude, gpsCoordsDecimal);
    }
    if (values.establishment) {
        values.establishmentName = values.name;
    }
}

function postBeforeUpdate(values) {
    var gpsCoordsDecimal = Location.get("gpsCoordsDecimal");

    if (values.alias === "") {
        values.alias = null;
    }
    if (values.latitude) {
        values.latitude = MathService.roundDecimal(values.latitude, gpsCoordsDecimal);
    }
    if (values.longitude) {
        values.longitude = MathService.roundDecimal(values.longitude, gpsCoordsDecimal);
    }
    if (values.establishment) {
        values.establishmentName = values.name;
    }
}

function getAddress(location, streetNum, city) {
    var address = "";

    if (location.establishment) {
        return location.name; // === establishmentName
    } else if (! location.city) {
        address = location.name;
    } else {
        if (city !== false) {
            address = location.city;
        }

        if (location.street) {
            address = location.street + (address ? ", " : "") + address;

            if (streetNum && location.streetNum) {
                address = location.streetNum + " " + address;
            }
        }
    }

    return address;
}

function getBillingLocation(user) {
    return Promise.coroutine(function* () {
        if (user.address) {
            return user.address;
        }

        return yield Location.findOne({
            userId: user.id,
            main: true
        });
    })();
}

function getMainLocationSnapshot(userId) {
    return Promise.coroutine(function* () {
        var location = yield Location.findOne({
            userId: userId,
            main: true
        });

        if (! location) {
            return;
        }

        return yield ModelSnapshot.getSnapshot("location", location);
    })();
}

async function hasUserLocations(locationsIds, userId) {
    if (!locationsIds || !locationsIds.length) return true;

    const locations = await Location.find({
        id: _.uniq(locationsIds),
        userId,
    });
    return locations.length === locationsIds.length;
}
