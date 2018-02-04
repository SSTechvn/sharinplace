/* global BankAccount, User */

/**
 * BankAccount.js
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
            columnType: 'varchar(255)',
            maxLength: 255,
        },
        updatedDate: {
            type: 'string',
            columnType: 'varchar(255)',
            maxLength: 255,
        },
        userId: {
            type: 'number',
            columnType: 'int',
            required: true,
            // index: true,
        },
        paymentProvider: {  // 'stripe' or 'mangopay'
            type: 'string',
            columnType: 'varchar(255)',
            required: true,
            maxLength: 255,
        },
        resourceOwnerId: {
            type: 'string',
            columnType: 'varchar(191)',
            required: true,
            maxLength: 191,
            // index: true,
        },
        resourceId: {
            type: 'string',
            columnType: 'varchar(191)',
            required: true,
            maxLength: 191,
            // index: true,
        },
        fingerprint: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
            maxLength: 255,
        },
        status: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
        },
        active: {
            type: 'boolean',
            columnType: 'tinyint(1)',
            allowNull: true,
        },
        ownerName: {
            type: 'string',
            columnType: 'varchar(255)',
            allowNull: true,
        },
        data: {
            type: 'json',
            columnType: 'json',
            defaultsTo: {},
        },
    },

    getAccessFields,
    parseMangopayData,
    fetchBankAccounts,

};

function getAccessFields(access) {
    var accessFields = {
        api: [
            'id',
            'createdDate',
            'updatedDate',
            'userId',
            'paymentProvider',
            'fingerprint',
            'status',
            'active',
            'ownerName',
            'data',
        ],
        self: [
            'id',
            'createdDate',
            'updatedDate',
            'userId',
            'paymentProvider',
            'fingerprint',
            'status',
            'active',
            'ownerName',
            'data',
        ],
    };

    return accessFields[access];
}

// https://docs.mangopay.com/endpoints/v2.01/bank-accounts
function parseMangopayData(rawJson) {
    const data = {
        type: rawJson.Type,
    };

    if (rawJson.IBAN) {
        data.iban = rawJson.IBAN;
    }
    if (rawJson.BIC) {
        data.bic = rawJson.BIC;
    }
    if (rawJson.OwnerAddress) {
        data.ownerAddress = rawJson.OwnerAddress;
    }
    if (rawJson.AccountNumber) {
        data.accountNumber = rawJson.AccountNumber;
    }
    if (rawJson.ABA) {
        data.aba = rawJson.ABA;
    }
    if (rawJson.DepositAccountType) {
        data.depositAccountType = rawJson.DepositAccountType;
    }
    if (rawJson.InstitutionNumber) {
        data.institutionNumber = rawJson.InstitutionNumber;
    }
    if (rawJson.BranchCode) {
        data.branchCode = rawJson.BranchCode;
    }
    if (rawJson.BankName) {
        data.bankName = rawJson.BankName;
    }
    if (rawJson.SortCode) {
        data.sortCode = rawJson.SortCode;
    }

    return {
        paymentProvider: 'mangopay',
        resourceOwnerId: rawJson.UserId,
        resourceId: rawJson.Id,
        active: rawJson.Active,
        ownerName: rawJson.OwnerName,
        data,
    };
}

async function fetchBankAccounts(user) {
    const resourceOwnerId = User.getMangopayUserId(user);
    if (!resourceOwnerId) {
        return [];
    }

    const bankAccounts = await BankAccount.find({
        resourceOwnerId,
        active: true,
    });

    return bankAccounts;
}