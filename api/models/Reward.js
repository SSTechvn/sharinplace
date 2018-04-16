/**
* Reward.js
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
        userId: {
            type: 'number',
            columnType: 'int',
            required: true,
        },
        type: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        triggerType: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        triggerId: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        targetType: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        targetId: {
            type: 'number',
            columnType: 'int',
            allowNull: true,
        },
        reference: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
        usedDate: {
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

    indexes: [
        'userId',
    ],

};

