/* global CustomAttributesService, Listing, ListingType, StelaceConfigService, ToolsService */

module.exports = {

    resetCache,

    getDefaultListingTypeProperties,
    checkListingTypeProperty,
    isValidProperties,

    getDefaultListingTypeConfig,
    isValidConfig,
    checkListingTypeConfigField,

    getAllListingTypes,
    getListingTypes,
    getListingType,
    isValidListingTypesIds,
    filterListingTypes,

    getComputedListingType,

    createListingType,
    updateListingType,
    destroyListingType,

};

const moment = require('moment');
const _ = require('lodash');
const createError = require('http-errors');

let cached = false;
let allListingTypes;
let listingTypes;
let indexedListingTypes;

const listingTypeProperties = {
    TIME: {
        values: ['NONE', 'TIME_PREDEFINED', 'TIME_FLEXIBLE'],
        defaultValue: 'NONE',
    },
    ASSESSMENTS: {
        values: ['NONE', 'ONE_STEP', 'TWO_STEPS'],
        defaultValue: 'NONE',
    },
    AVAILABILITY: {
        values: ['NONE', 'UNIQUE', 'STOCK'],
        defaultValue: 'NONE',
    },
    DYNAMIC_PRICING: {
        values: ['NONE'],
        defaultValue: 'NONE',
    },
    PLACE: {
        values: ['NONE', 'PLACE', 'PLACE_MULTIPLE'],
        defaultValue: 'NONE',
    },
};

function resetCache() {
    cached = false;
}

function getDefaultListingTypeProperties() {
    return _.reduce(_.keys(listingTypeProperties), (memo, key) => {
        memo[key] = listingTypeProperties[key].defaultValue;
        return memo;
    }, {});
}

function isValidProperties(properties) {
    const requiredFields = ['TIME', 'ASSESSMENTS', 'AVAILABILITY', 'DYNAMIC_PRICING', 'PLACE'];
    const requiredConfig = _.pick(properties, requiredFields);
    const hasAllFields = requiredFields.length === _.keys(requiredConfig).length;
    if (!hasAllFields) {
        return false;
    }

    const isValid = _.reduce(requiredFields, (memo, field) => {
        if (!checkListingTypeProperty(field, properties[field])) {
            return false;
        }
        return memo;
    }, true);

    return isValid;
}

function checkListingTypeProperty(name, value) {
    const config = listingTypeProperties[name];
    if (!config) return false;

    return _.includes(config.values, value);
}

function getDefaultListingTypeConfig() {
    return {
        pricing: {
            ownerFeesPercent: 0,
            takerFeesPercent: 0,
            maxDiscountPercent: 0,
        },
        bookingTime: {
            timeUnit: 'd',
            minDuration: 1,
            maxDuration: 100,
            startDateMinDelta: { d: 1 },
            startDateMaxDelta: { d: 90 },
            releaseDateAfterEndDate: { d: 7 },
        },
        rating: {
            remainingTimeToRateAfterBookingCompletion: { d: 60 },
            remainingTimeToUpdateAfterAllRatings: { d: 1 },
        },
    };
}

function isValidConfig(config) {
    return typeof config === 'object'
        && checkListingTypeConfigField('pricing', config.pricing)
        && checkListingTypeConfigField('bookingTime', config.bookingTime)
        && checkListingTypeConfigField('rating', config.rating);
}

function checkListingTypeConfigField(field, value) {
    if (field === 'pricing') {
        if (typeof value !== 'object') return false;
        const obj = value;

        return ToolsService.isWithinIntegerRange(obj.ownerFeesPercent, { min: 0, max: 100 })
            && ToolsService.isWithinIntegerRange(obj.takerFeesPercent, { min: 0, max: 100 })
            && ToolsService.isWithinIntegerRange(obj.maxDiscountPercent, { min: 0, max: 100 });
    } else if (field === 'bookingTime') {
        if (typeof value !== 'object') return false;

        const timeGranularities = StelaceConfigService.getTimeGranularities();
        const obj = value;

        return _.includes(timeGranularities, obj.timeUnit)
            && ToolsService.isWithinIntegerRange(obj.minDuration, { min: 1 })
            && ToolsService.isWithinIntegerRange(obj.maxDuration, { min: 1 })
            && obj.minDuration <= obj.maxDuration
            && ToolsService.isDurationObject(obj.startDateMinDelta, { min: 0 })
            && ToolsService.isDurationObject(obj.startDateMaxDelta, { min: 0 })
            && moment.duration(obj.startDateMinDelta).asMilliseconds() <= moment.duration(obj.startDateMaxDelta).asMilliseconds()
            && ToolsService.isDurationObject(obj.releaseDateAfterEndDate, { min: 0 });
    } else if (field === 'rating') {
        if (typeof value !== 'object') return false;

        const obj = value;

        return ToolsService.isDurationObject(obj.remainingTimeToRateAfterBookingCompletion, { min: 0 })
            && ToolsService.isDurationObject(obj.remainingTimeToUpdateAfterAllRatings, { min: 0 });
    }
}

async function _fetchTypes() {
    if (cached) return;

    const types = await ListingType.find();
    _updateCache(types);
    cached = true;
}

function _constructFromDefault(types) {
    const defaultProperties = getDefaultListingTypeProperties();

    return _.reduce(types, (memo, type) => {
        const newType = _.assign({}, type);
        newType.properties = _.defaults({}, type.properties, defaultProperties);
        memo.push(newType);
        return memo;
    }, []);
}

async function _updateCache(types) {
    types = _constructFromDefault(types);
    allListingTypes = types;
    listingTypes = _.filter(types, type => type.active);
    indexedListingTypes = _.indexBy(allListingTypes, 'id');
}

async function getAllListingTypes() {
    await _fetchTypes();
    return allListingTypes;
}

// returns only active listing types
async function getListingTypes() {
    await _fetchTypes();
    return listingTypes;
}

async function getListingType(listingTypeId, { onlyActive = true } = {}) {
    await _fetchTypes();

    const array = onlyActive ? listingTypes : allListingTypes;
    return _.find(array, listingType => listingType.id === listingTypeId);
}

async function isValidListingTypesIds(listingTypesIds, { onlyActive = true } = {}) {
    await _fetchTypes();

    return _.reduce(listingTypesIds, (memo, listingTypeId) => {
        const listingType = indexedListingTypes[listingTypeId];
        if (!listingType) return false;
        if (onlyActive && !listingType.active) return false;
        return memo;
    }, true);
}

async function filterListingTypes(listingTypesIds, { onlyActive = true } = {}) {
    await _fetchTypes();

    return _.reduce(listingTypesIds, (memo, listingTypeId) => {
        const listingType = indexedListingTypes[listingTypeId];
        if (!listingType) return memo;
        if (onlyActive && !listingType.active) return memo;

        memo.push(listingType);
        return memo;
    }, []);
}

/**
 * Compute a listing type based on default value or existing listing type
 * @param {Object} params
 * @param {String} [params.name]
 * @param {Object} [params.properties]
 * @param {Object} [params.config]
 * @param {Object[]} [params.customAttributes]
 * @param {Boolean} [params.active]
 * @param {Object} existingListingType
 * @param {Object} options
 * @param {String} options.locale
 * @param {String} options.fallbackLocale
 * @return {Object} res
 * @return {Object} res.computedListingType
 * @return {String[]} res.errors
 */
function getComputedListingType(params, existingListingType, { locale, fallbackLocale }) {
    const {
        name,
        properties,
        config,
        customAttributes,
        active,
    } = params;

    const defaultProperties = getDefaultListingTypeProperties();
    const defaultConfig = getDefaultListingTypeConfig();

    let computedListingType = {};

    if (existingListingType) {
        computedListingType.properties = _.merge(existingListingType.properties, properties || {});
        computedListingType.config = _.merge(existingListingType.config, config || {});
        computedListingType.customAttributes = customAttributes ? customAttributes : existingListingType.customAttributes;
        computedListingType.active = (typeof active !== 'undefined' ? active : existingListingType.active);

        const delta = ListingType.getI18nModelDelta(existingListingType, { name }, { locale, fallbackLocale });
        computedListingType = _.merge({}, computedListingType, delta);
    } else {
        computedListingType.properties = _.merge(defaultProperties, properties || {});
        computedListingType.config = _.merge(defaultConfig, config || {});
        computedListingType.customAttributes = customAttributes || [];
        computedListingType.active = (typeof active !== 'undefined' ? active : true);

        const delta = ListingType.getI18nModelDelta(null, { name }, { locale, fallbackLocale });
        computedListingType = _.merge({}, computedListingType, delta);
    }

    const errors = [];

    if (typeof computedListingType.name !== 'string') {
        errors.push('name');
    }
    if (!isValidProperties(computedListingType.properties)) {
        errors.push('properties');
    }
    if (!isValidConfig(computedListingType.config)) {
        errors.push('config');
    }
    if (!CustomAttributesService.isValidCustomAttributes(computedListingType.customAttributes)) {
        errors.push('customAttributes');
    }
    if (typeof computedListingType.active !== 'boolean') {
        errors.push('active');
    }

    return {
        computedListingType,
        errors,
    };
}

/**
 * @param {Object} params
 * @param {String} params.name
 * @param {Object} [params.properties]
 * @param {Object} [params.config]
 * @param {Object[]} [params.customAttributes]
 * @param {Boolean} [params.active]
 * @param {Object} options
 * @param {String} options.locale
 * @param {String} options.fallbackLocale
 */
async function createListingType({
    name,
    properties,
    config,
    customAttributes,
    active,
} = {}, {
    locale,
    fallbackLocale,
} = {}) {
    const { computedListingType, errors } = getComputedListingType({
        name,
        properties,
        config,
        customAttributes,
        active,
    }, null, { locale, fallbackLocale });

    if (errors.length) {
        throw createError(400, 'Bad params');
    }

    const listingType = await ListingType.create(computedListingType);
    resetCache();

    return listingType;
}

/**
 * @param {Number} listingTypeId
 * @param {Object} params
 * @param {String} params.name
 * @param {Object} [params.properties]
 * @param {Object} [params.config]
 * @param {Object[]} [params.customAttributes]
 * @param {Boolean} [params.active]
 * @param {Object} options
 * @param {String} options.locale
 * @param {String} options.fallbackLocale
 */
async function updateListingType(listingTypeId, {
    name,
    properties,
    config,
    customAttributes,
    active,
} = {}, {
    locale,
    fallbackLocale,
} = {}) {
    const listingType = await getListingType(listingTypeId, { onlyActive: false });
    if (!listingType) {
        throw createError(404);
    }

    const { computedListingType, errors } = getComputedListingType({
        name,
        properties,
        config,
        customAttributes,
        active,
    }, listingType, { locale, fallbackLocale });

    if (errors.length) {
        throw createError(400, 'Bad params');
    }

    let updatedListingType;

    await ListingType.getDatastore().transaction(async (db, proceed) => {
        const oldProperties = listingType.properties;
        const { AVAILABILITY } = computedListingType.properties;

        if (oldProperties.AVAILABILITY !== AVAILABILITY && AVAILABILITY === 'UNIQUE') {
            await Listing.update({ listingTypeId }, { quantity: 1 }).usingConnection(db);
        }

        [updatedListingType] = await ListingType.update({ id: listingTypeId }, computedListingType).usingConnection(db);
        if (!updatedListingType) {
            throw createError('Listing type not found');
        }

        proceed();
    });

    resetCache();

    return updatedListingType;
}

async function destroyListingType(listingTypeId) {
    await ListingType.destroy({ id: listingTypeId });
    resetCache();
}
