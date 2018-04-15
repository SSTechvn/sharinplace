/* global ModelSnapshot */

/**
* ModelSnapshot.js
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
        targetId: {
            type: 'number',
            columnType: 'int',
            required: true,
        },
        targetType: {
            type: 'string',
            columnType: 'varchar(191)',
            maxLength: 191,
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

    indexes: [
        'targetId',
    ],

    get: get,

    isIdentical: isIdentical,
    getSnapshot: getSnapshot,
    fetch: fetch,
    exposeSnapshot: exposeSnapshot

};

var params = {
    targetTypes: ["user", "listing", "location"]
};

const _ = require('lodash');

function get(prop) {
    if (prop) {
        return params[prop];
    } else {
        return params;
    }
}

function _exposeSnapshot(snapshot) {
    var obj = snapshot.data;
    obj.id = snapshot.id;
    obj.snapshot = true;

    return obj;
}

function getComparedFields(targetType) {
    var comparedFields;

    if (targetType === "user") {
        comparedFields = [
            "username",
            "firstname",
            "lastname",
            "description",
            "phone",
            "phoneCountryCode",
            "phoneCheck",
            "roles",
            "email",
            "emailCheck",
            "mediaId",
            "ratingScore",
            "nbRatings",
            "birthday",
            "nationality",
            "countryOfResidence",
            "address",
            "points",
            "levelId"
        ];
    } else if (targetType === "listing") {
        comparedFields = [
            "name",
            "nameURLSafe",
            "description",
            "stateComment",
            "bookingPreferences",
            "accessories",
            "ownerId",
            "brandId",
            "reference",
            "listingCategoryId",
            "mediasIds",
            "instructionsMediasIds",
            "validated",
            "validationPoints",
            "ratingScore",
            "nbRatings",
            "autoBookingAcceptance",
            "locations",
            "listingTypesIds",
            "sellingPrice",
            "timeUnitPrice",
            "pricingId",
            "customPricingConfig",
            "deposit",
            "acceptFree"
        ];
    } else if (targetType === "location") {
        comparedFields = [
            "name",
            "alias",
            "streetNum",
            "street",
            "postalCode",
            "city",
            "department",
            "region",
            "country",
            "latitude",
            "longitude",
            "transportMode",
            "userId",
            "establishment",
            "establishmentName",
            "provider",
            "remoteId"
        ];
    }

    return comparedFields;
}

function isIdentical(targetType, model, snapshot) {
    if (! _.contains(ModelSnapshot.get("targetTypes"), targetType)) {
        return false;
    }

    var comparedFields = getComparedFields(targetType);

    var modelFields    = _.pick(model, comparedFields);
    var snapshotFields = _.pick(snapshot.data, comparedFields);

    return _.isEqual(modelFields, snapshotFields);
}

function getSnapshot(targetType, model, force) {
    return Promise
        .resolve()
        .then(() => {
            if (! _.contains(ModelSnapshot.get("targetTypes"), targetType)
                || ! model || ! model.id
            ) {
                throw new Error("bad params");
            }

            // do not fetch existing snapshots
            if (force) {
                return;
            }

            return ModelSnapshot
                .find({
                    targetId: model.id,
                    targetType: targetType
                })
                .sort('createdDate DESC')
                .limit(1)
                .then(snapshots => snapshots[0]);
        })
        .then(snapshot => {
            if (snapshot && isIdentical(targetType, model, snapshot)) {
                return _exposeSnapshot(snapshot);
            }

            return ModelSnapshot
                .create({
                    targetId: model.id,
                    targetType: targetType,
                    data: _.pick(model, getComparedFields(targetType))
                })
                .then(snapshot => {
                    return _exposeSnapshot(snapshot);
                });
        });
}

function fetch(snapshotIdOrIds) {
    return Promise
        .resolve()
        .then(() => {
            return ModelSnapshot.find({ id: snapshotIdOrIds });
        })
        .then(snapshots => {
            var exposedSnapshots = _.map(snapshots, function (snapshot) {
                return _exposeSnapshot(snapshot);
            });

            if (! _.isArray(snapshotIdOrIds)) {
                if (snapshots.length) {
                    return exposedSnapshots[0];
                } else {
                    return null;
                }
            } else {
                return exposedSnapshots;
            }
        });
}

function exposeSnapshot(snapshot, originalId) {
    var obj = _exposeSnapshot(snapshot);

    if (originalId) {
        obj.id = snapshot.targetId;
    }

    return obj;
}
