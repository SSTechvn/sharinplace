/**
* Brand.js
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
        name: {
            type: 'string',
            columnType: 'varchar(191)',
            required: true,
            unique: true,
            maxLength: 191,
        },
        listingCategories: {
            type :'json',
            columnType: 'json',
            defaultsTo: [],
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

    getAccessFields: getAccessFields

};

function getAccessFields(access) {
    var accessFields = {
        others: [
            "id",
            "name"
        ]
    };

    return accessFields[access];
}
