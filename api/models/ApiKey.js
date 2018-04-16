/**
 * ApiKey.js
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
        key: {
            type: 'string',
            unique: true,
            columnType: 'varchar(191)',
            maxLength: 191,
            required: true,
        },
        revokedDate: {
            type: 'string',
            columnType: 'varchar(24)',
            allowNull: true,
            maxLength: 24,
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

    getAccessFields,
    generateKey,

};

const Uuid = require('uuid');

function getAccessFields(access) {
    var accessFields = {
        api: [
            'id',
            'key',
            'createdDate',
            'revokedDate',
        ],
    };

    return accessFields[access];
}

function generateKey() {
    return Uuid.v4();
}
