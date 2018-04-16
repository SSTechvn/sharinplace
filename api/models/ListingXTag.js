/**
* ListingXTag.js
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
        listingId: {
            type: 'number',
            columnType: 'int',
            required: true,
        },
        tagId: {
            type: 'number',
            columnType: 'int',
            required: true,
        },
    },

    indexes: [
        'listingId',
        'tagId',
    ],

};

