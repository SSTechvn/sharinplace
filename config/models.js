/* global ModelService */

/**
 * Default model settings
 * (sails.config.models)
 *
 * Your default, project-wide model settings. Can also be overridden on a
 * per-model basis by setting a top-level properties in the model definition.
 *
 * For details about all available model settings, see:
 * https://sailsjs.com/config/models
 *
 * For more general background on Sails model settings, and how to configure
 * them on a project-wide or per-model basis, see:
 * https://sailsjs.com/docs/concepts/models-and-orm/model-settings
 */

module.exports.models = {

    datastore: 'MySQLServer',
    schema: true,

    migrate: 'safe',

    dataEncryptionKeys: {
        default: '9mpGP84T2bIDLZ0S9ivnPB+1OK4R4c1C1rIc0Gfq/dc='
    },

    cascadeOnDestroy: false,

    fetchRecordsOnCreate: true,
    fetchRecordsOnUpdate: true,
    fetchRecordsOnDestroy: true,
    fetchRecordsOnCreateEach: true,

    beforeCreate,
    beforeUpdate,
    beforeCreateDates,
    beforeUpdateDates,
    getAccessFields,

    expose,
    exposeAll,
    exposeTransform,

    getI18nModel,
    getI18nModelDelta,
    setI18nModel,

    updateOne,
    getCollection,
    getDefinition,
    getKnex,
    buildQuery,
    sendNativeQuery,

};

/////////////
// WARNING //
/////////////

/*

=> http://sailsjs.org/documentation/reference/waterline-orm/records/save
- Avoid to use waterline instance method like save() in promises as it NOT transactional (record can be corrupted during update)

- Check empty arrays in OR queries, the following query will throw an error:
{
    or: [
        { userId: usersIds }, // usersIds can be empty
        { mediaId: mediasIds }, // mediasIds can be empty
    ]
}

*/

const _ = require('lodash');
const createError = require('http-errors');

const knex = require('knex')({
    client: 'mysql',
});

function beforeCreate(values, next) {
    beforeCreateDates(values);
    next();
}

function beforeCreateDates(values) {
    const now = new Date().toISOString();
    values.createdDate = now;
    values.updatedDate = now;
}

function beforeUpdate(values, next) {
    beforeUpdateDates(values);
    next();
}

function beforeUpdateDates(values) {
    const now = new Date().toISOString();
    values.updatedDate = now;
    delete values.createdDate;
}

function getAccessFields(access) {
    const accessFields = {};
    return accessFields[access];
}

function expose(element, access = 'others', { locale, fallbackLocale } = {}) {
    const model = this;

    let object = _.cloneDeep(element);

    if (locale && typeof model.getI18nMap === 'function') {
        object = model.getI18nModel(object, { locale, fallbackLocale });
    }

    if (access === 'admin') {
        return object;
    }

    if (typeof element === 'undefined' || element === null) {
        return null;
    }

    const accessFields = model.getAccessFields(access);
    if (! accessFields) {
        return {};
    } else {
        _.forEach(accessFields, function (field) {
            model.exposeTransform(object, field, access);
        });
        return _.pick(object, accessFields);
    }
}

function exposeAll(elements, access, { locale, fallbackLocale } = {}) {
    const model = this;

    if (! _.isArray(elements)) {
        throw new Error('array of elements expected');
    }

    return _.reduce(elements, (memo, element) => {
        memo.push(model.expose(element, access, { locale, fallbackLocale }));
        return memo;
    }, []);
}

function exposeTransform(/* element, field, access */) {
    // do nothing (only for template, exposeTransform on model override)
}

function getI18nModel(element, { locale, fallbackLocale, useOnlyLocale }) {
    const model = this;

    if (typeof model.getI18nMap !== 'function') {
        throw new Error('Expected i18n map');
    }

    const i18nMap = model.getI18nMap();

    return ModelService.getI18nModel(element, { i18nMap, locale, fallbackLocale, useOnlyLocale });
}

function getI18nModelDelta(element, attrs, { locale, fallbackLocale }) {
    const model = this;

    if (typeof model.getI18nMap !== 'function') {
        throw new Error('Expected i18n map');
    }

    const i18nMap = model.getI18nMap();

    return ModelService.getI18nModelDelta(element, attrs, { i18nMap, locale, fallbackLocale });
}

function setI18nModel(element, attrs, { locale, fallbackLocale }) {
    const model = this;

    if (typeof model.getI18nMap !== 'function') {
        throw new Error('Expected i18n map');
    }

    const i18nMap = model.getI18nMap();

    ModelService.setI18nModel(element, attrs, { i18nMap, locale, fallbackLocale });
}

async function updateOne(queryIdOrObj, updateAttrs) {
    const model = this;

    const query = (typeof queryIdOrObj === 'object' ? queryIdOrObj : { id: queryIdOrObj });

    const records = await model.update(query, Object.assign({}, updateAttrs));

    if (! records.length) {
        throw createError('Update one - not found', {
            model: model.globalId,
            query: queryIdOrObj,
        });
    }
    if (records.length > 1) {
        throw createError('Update one - multiple instances', {
            model: model.globalId,
            query: queryIdOrObj,
        });
    }

    return records[0];
}

function getCollection() {
    return this.adapter.collection;
}

function getDefinition() {
    return this.definition;
}

function getKnex() {
    return knex;
}

function buildQuery() {
    const collection = this.getCollection();
    return knex.from(collection);
}

function sendNativeQuery(query) {
    return new Promise((resolve, reject) => {
        const mysql = this.getDatastore().manager;
        mysql.pool.query(query, (err, res) => {
            if (err) return reject(err);
            resolve(res);
        });
    });
}
