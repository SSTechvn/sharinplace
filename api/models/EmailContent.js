/**
 * EmailContent.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
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
        mandrillMessageId: {
            type: 'string',
            columnType: 'varchar(191)',
            allowNull: true,
            maxLength: 191,
        },
        info: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
        content: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

    indexes: [
        'mandrillMessageId',
    ],

};

