/**
* EmailLog.js
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
            allowNull: true,
        },
        fromEmail: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        fromName: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        toEmail: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        toName: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        replyTo: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        specificTemplateName: { // templateName can be a generic template
            type: 'string',
            columnType: 'varchar(191)',
            maxLength: 191,
            allowNull: true,
        },
        templateName: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        subject: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
        tags: {
            type: 'json',
            columnType: 'json',
            defaultsTo: [],
        },
        sentDate: {
            type: 'string',
            columnType: 'varchar(24)',
            allowNull: true,
            maxLength: 24,
        },
        status: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        mandrillMessageId: {
            type: 'string',
            columnType: 'varchar(191)',
            allowNull: true,
            maxLength: 191,
        },
        sparkpostTransmissionId: {
            type: 'string',
            columnType: 'varchar(191)',
            allowNull: true,
            maxLength: 191,
        },
        html: {
            type: 'string',
            columnType: 'longtext',
            allowNull: true,
        },
    },

    indexes: [
        'userId',
        'specificTemplateName',
        'mandrillMessageId',
        'sparkpostTransmissionId',
    ],

};
