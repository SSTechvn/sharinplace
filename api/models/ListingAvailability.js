/**
 * ListingAvailability.js
 *
 * @description :: A model definition.  Represents a database table/collection/etc.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
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
            columnType: 'varchar(24)',
            maxLength: 24,
        },
        updatedDate: {
            type: 'string',
            columnType: 'varchar(24)',
            maxLength: 24,
        },
        listingId: {
            type: 'number',
            columnType: 'int',
            required: true,
        },
        startDate: {
            type: 'string',
            columnType: 'varchar(24)',
            allowNull: true,
            maxLength: 24,
        },
        endDate: {
            type: 'string',
            columnType: 'varchar(24)',
            allowNull: true,
            maxLength: 24,
        },
        quantity: {
            type: 'number',
            columnType: 'int',
            defaultsTo: 1,
        },
        available: {
            type: 'boolean',
            columnType: 'tinyint(1)',
            allowNull: true,
        },
        type: { // 'period' or 'date'
            type: 'string',
            columnType: 'varchar(255)',
            maxLength: 255,
            required: true,
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

    indexes: [
        'listingId',
    ],

    getAccessFields,
    isValidType,

};

const _ = require('lodash');

function getAccessFields(access) {
    var accessFields = {
        others: [
            'id',
            'listingId',
            'startDate',
            'endDate',
            'quantity',
            'available',
        ],
    };

    return accessFields[access];
}

function isValidType(type) {
    return _.includes(['period', 'date'], type);
}
