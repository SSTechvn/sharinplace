/**
 * Role.js
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
        name: {
            type: 'string',
            columnType: 'varchar(255)',
            required: true,
            maxLength: 255,
        },
        namesI18n: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
        value: {
            type: 'string',
            columnType: 'varchar(255)',
            required: true,
            maxLength: 255,
        },
        parentId: {
            type: 'number',
            columnType: 'int',
            allowNull: true,
        },
        permissions: {
            type: 'json',
            columnType: 'json',
            defaultsTo: [],
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

};

