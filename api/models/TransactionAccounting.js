/**
* TransactionAccounting.js
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
            columnType: 'varchar(24)',
            maxLength: 24,
        },
        updatedDate: {
            type: 'string',
            columnType: 'varchar(24)',
            maxLength: 24,
        },
        transactionId: {
            type: 'number',
            columnType: 'int',
        },
        credit: {
            type: 'number',
            columnType: 'float',
            allowNull: true,
        },
        debit: {
            type: 'number',
            columnType: 'float',
            allowNull: true,
        },
        payment: {
            type: 'number',
            columnType: 'float',
            allowNull: true,
        },
        cashing: {
            type: 'number',
            columnType: 'float',
            allowNull: true,
        },
        label: {
            type: 'string',
            columnType: 'varchar(255)',
            required: true,
            maxLength: 255,
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

    indexes: [
        'transactionId',
    ],

};

