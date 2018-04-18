/*
    global CustomAttributesService, Listing, ListingAvailability, ListingTypeService, Location, Media, MicroService, PricingService,
    StelaceConfigService, StelaceEventService, Tag, TimeService, ToolsService
*/

module.exports = {

    createListing,
    updateListing,
    destroyListing,
    updateListingMedias,
    pauseListingToggle,
    validateListing,
    createListingAvailability,
    updateListingAvailability,
    removeListingAvailability,

};

const moment = require('moment');
const _ = require('lodash');
const createError = require('http-errors');

/**
 * @param {Object} attrs
 * @param {String} attrs.name
 * @param {Number} attrs.ownerId
 * @param {String} [attrs.reference]
 * @param {Number} attrs.timeUnitPrice
 * @param {Number} attrs.sellingPrice
 * @param {Number} attrs.deposit
 * @param {Number} [attrs.quantity = 1]
 * @param {String} [attrs.description]
 * @param {Number[]} [attrs.tags]
 * @param {String} [attrs.stateComment]
 * @param {String} [attrs.bookingPreferences]
 * @param {String[]} [attrs.accessories]
 * @param {Number} [attrs.brandId]
 * @param {Number} [attrs.listingCategoryId]
 * @param {Boolean} [attrs.validation]
 * @param {String[]} [attrs.validationFields]
 * @param {Number[]} [attrs.locations]
 * @param {String} [attrs.recurringDatesPattern]
 * @param {Number} [attrs.listingTypeId]
 * @param {Object} [attrs.customPricingConfig]
 * @param {Boolean} [attrs.acceptFree]
 * @param {Object} [options]
 * @param {Object} [options.req]
 * @param {Object} [options.res]
 * @result {Object} created listing
 */
async function createListing(attrs, { req, res } = {}) {
    const filteredAttrs = [
        'name',
        'ownerId',
        'reference',
        'description',
        'tags',
        'stateComment',
        'bookingPreferences',
        'accessories',
        'quantity',
        'brandId',
        'listingCategoryId',
        'validation',
        'validationFields',
        'locations',
        'recurringDatesPattern',
        'listingTypeId',
        'timeUnitPrice',
        'sellingPrice',
        'customPricingConfig',
        'deposit',
        'acceptFree',
    ];
    let createAttrs = _.pick(attrs, filteredAttrs);

    if (! createAttrs.name
        || !createAttrs.ownerId
        || (createAttrs.tags && !MicroService.checkArray(createAttrs.tags, 'id'))
        || (createAttrs.locations && !MicroService.checkArray(createAttrs.locations, 'id'))
        || (typeof createAttrs.sellingPrice !== 'undefined' && (typeof createAttrs.sellingPrice !== 'number' || createAttrs.sellingPrice < 0))
        || (typeof createAttrs.timeUnitPrice !== 'undefined' && (typeof createAttrs.timeUnitPrice !== 'number' || createAttrs.timeUnitPrice < 0))
        || (typeof createAttrs.deposit !== 'undefined' && (typeof createAttrs.deposit !== 'number' || createAttrs.deposit < 0))
        || (!createAttrs.listingTypeId || isNaN(createAttrs.listingTypeId))
        || (createAttrs.customPricingConfig && createAttrs.customPricingConfig.duration && ! PricingService.isValidCustomDurationConfig(createAttrs.customPricingConfig.duration))
        || (createAttrs.recurringDatesPattern && !TimeService.isValidCronPattern(createAttrs.recurringDatesPattern))
        || (typeof createAttrs.quantity === 'number' && createAttrs.quantity < 0)
    ) {
        throw createError(400);
    }

    if (typeof createAttrs.quantity === 'undefined') {
        createAttrs.quantity = 1;
    }

    createAttrs.listingTypeId = parseInt(createAttrs.listingTypeId, 10);

    const listingType = await ListingTypeService.getListingType(createAttrs.listingTypeId);
    if (!listingType) {
        throw createError(400);
    }

    const config = await StelaceConfigService.getConfig();

    const { TIME, AVAILABILITY } = listingType.properties;

    if (TIME === 'TIME_FLEXIBLE' && typeof createAttrs.timeUnitPrice !== 'number') {
        throw createError(400);
    }
    if (TIME !== 'TIME_FLEXIBLE' && typeof createAttrs.sellingPrice !== 'number') {
        throw createError(400);
    }

    if (AVAILABILITY === 'NONE' || AVAILABILITY === 'UNIQUE') {
        createAttrs.quantity = 1;
    }

    const modelDelta = Listing.getI18nModelDelta(null, createAttrs, {
        locale: config.lang,
        fallbackLocale: config.lang,
    });
    createAttrs = _.merge({}, createAttrs, modelDelta);

    if (createAttrs.recurringDatesPattern) {
        createAttrs.recurringDatesPattern = TimeService.forceCronPattern(
            createAttrs.recurringDatesPattern,
            listingType.config.bookingTime.timeUnit || 'd'
        );
    }

    let data = createAttrs.data || {};
    const { newData, valid } = CustomAttributesService.checkData(data, listingType.customAttributes);
    if (!valid) {
        throw createError(400, 'Incorrect custom attributes');
    }
    data = newData;

    createAttrs.data = data;

    if (createAttrs.sellingPrice) {
        createAttrs.sellingPrice = PricingService.roundPrice(createAttrs.sellingPrice);
    }
    if (createAttrs.timeUnitPrice) {
        createAttrs.timeUnitPrice = PricingService.roundPrice(createAttrs.timeUnitPrice);
    }
    if (createAttrs.deposit) {
        createAttrs.deposit = PricingService.roundPrice(createAttrs.deposit);
    }

    createAttrs.sellingPrice = createAttrs.sellingPrice || 0;
    createAttrs.timeUnitPrice = createAttrs.timeUnitPrice || 0;
    createAttrs.deposit = createAttrs.deposit || 0;

    const [
        userLocations,
        validLocations,
        validReferences,
        validTags,
    ] = await Promise.all([
        ! createAttrs.locations ? Location.find({ userId: createAttrs.ownerId }) : [],
        createAttrs.locations ? Location.hasUserLocations(createAttrs.locations, createAttrs.ownerId) : true,
        Listing.isValidReferences({
            brandId: createAttrs.brandId,
            listingCategoryId: createAttrs.listingCategoryId,
        }),
        Tag.existTags(createAttrs.tags),
    ]);

    if (!validReferences
        || !validTags
        || (createAttrs.locations && !validLocations)
    ) {
        throw createError(400);
    }

    if (!createAttrs.locations) {
        createAttrs.locations = _.pluck(userLocations, 'id');
    }

    if (config.listings_validation_automatic) {
        createAttrs.validated = true;
    }

    let listing = await Listing.create(Object.assign({}, createAttrs));

    if (createAttrs.tags) {
        listing = await Listing.updateTags(listing, createAttrs.tags);
    }

    await StelaceEventService.createEvent({
        req,
        res,
        label: 'listing.created',
        type: 'core',
        listingId: listing.id,
        data: {
            nbPictures: listing.mediasIds.length,
        },
    });

    return listing;
}

/**
 * @param {Number} listingId
 * @param {Object} attrs
 * @param {String} [attrs.name]
 * @param {String} [attrs.reference]
 * @param {Number} [attrs.timeUnitPrice]
 * @param {Number} [attrs.sellingPrice]
 * @param {Number} [attrs.deposit]
 * @param {String} [attrs.description]
 * @param {Number[]} [attrs.tags]
 * @param {String} [attrs.stateComment]
 * @param {String} [attrs.bookingPreferences]
 * @param {String[]} [attrs.accessories]
 * @param {Number} [attrs.brandId]
 * @param {Number} [attrs.listingCategoryId]
 * @param {Boolean} [attrs.validation]
 * @param {String[]} [attrs.validationFields]
 * @param {Number[]} [attrs.locations]
 * @param {String} [attrs.recurringDatesPattern]
 * @param {Number} [attrs.listingTypeId]
 * @param {Object} [attrs.customPricingConfig]
 * @param {Boolean} [attrs.acceptFree]
 * @param {Object} [attrs.data]
 * @param {Object} [options]
 * @param {Number} [options.userId] - if specified, check if the listing owner id matches the provided userId
 * @result {Object} updated listing
 */
async function updateListing(listingId, attrs = {}, { userId } = {}) {
    const filteredAttrs = [
        'name',
        'reference',
        'description',
        'tags',
        'stateComment',
        'bookingPreferences',
        'accessories',
        'brandId',
        'quantity',
        'listingCategoryId',
        'locations',
        'recurringDatesPattern',
        'listingTypeId',
        'timeUnitPrice',
        'sellingPrice',
        'customPricingConfig',
        'deposit',
        'acceptFree',
        'data',
    ];
    let updateAttrs = _.pick(attrs, filteredAttrs);

    if ((updateAttrs.tags && ! MicroService.checkArray(updateAttrs.tags, 'id'))
        || (updateAttrs.locations && ! MicroService.checkArray(updateAttrs.locations, 'id'))
        || (updateAttrs.listingTypeId && isNaN(updateAttrs.listingTypeId))
        || (updateAttrs.data && typeof updateAttrs.data !== 'object')
        || (updateAttrs.sellingPrice && (typeof updateAttrs.sellingPrice !== 'number' || updateAttrs.sellingPrice < 0))
        || (updateAttrs.timeUnitPrice && (typeof updateAttrs.timeUnitPrice !== 'number' || updateAttrs.timeUnitPrice < 0))
        || (updateAttrs.deposit && (typeof updateAttrs.deposit !== 'number' || updateAttrs.deposit < 0))
        || (updateAttrs.customPricingConfig && updateAttrs.customPricingConfig.duration && ! PricingService.isValidCustomDurationConfig(updateAttrs.customPricingConfig.duration))
        || (updateAttrs.recurringDatesPattern && !TimeService.isValidCronPattern(updateAttrs.recurringDatesPattern))
        || (updateAttrs.quantity && (typeof updateAttrs.quantity !== 'number' || updateAttrs.quantity < 0))
    ) {
        throw createError(400);
    }

    if (typeof updateAttrs.sellingPrice === "number") {
        updateAttrs.sellingPrice = PricingService.roundPrice(updateAttrs.sellingPrice);
    }
    if (typeof updateAttrs.timeUnitPrice === "number") {
        updateAttrs.timeUnitPrice = PricingService.roundPrice(updateAttrs.timeUnitPrice);
    }
    if (typeof updateAttrs.deposit === "number") {
        updateAttrs.deposit = PricingService.roundPrice(updateAttrs.deposit);
    }

    const config = await StelaceConfigService.getConfig();

    const listing = await Listing.findOne({ id: listingId });
    if (! listing) {
        throw createError(404);
    }
    if (userId && listing.ownerId !== userId) {
        throw createError(403);
    }

    if (updateAttrs.listingTypeId) {
        updateAttrs.listingTypeId = parseInt(updateAttrs.listingTypeId, 10);

        const validListingTypes = await ListingTypeService.isValidListingTypesIds([updateAttrs.listingTypeId])
        if (!validListingTypes) {
            throw createError(400);
        }
    }

    // check custom attributes even if there is no data (in case listing types custom attributes changed)
    const listingType = await ListingTypeService.getListingType(updateAttrs.listingTypeId || listing.listingTypeId);
    let data = _.merge(listing.data || {}, updateAttrs.data || {});
    const { newData, valid } = CustomAttributesService.checkData(data, listingType.customAttributes);
    if (!valid) {
        throw createError(400, 'Incorrect custom attributes');
    }
    data = newData;

    updateAttrs.data = data;

    if (updateAttrs.recurringDatesPattern) {
        updateAttrs.recurringDatesPattern = TimeService.forceCronPattern(
            updateAttrs.recurringDatesPattern,
            listingType.config.bookingTime.timeUnit || 'd'
        );
    }

    const { AVAILABILITY } = listingType.properties;

    if (AVAILABILITY === 'NONE' || AVAILABILITY === 'UNIQUE') {
        updateAttrs.quantity = 1;
    }

    const [
        validReferences,
        validLocations,
        validTags,
    ] = await Promise.all([
        Listing.isValidReferences({
            brandId: updateAttrs.brandId,
            listingCategoryId: updateAttrs.listingCategoryId
        }),
        Location.hasUserLocations(updateAttrs.locations, listing.ownerId),
        Tag.existTags(updateAttrs.tags)
    ]);

    if (! validReferences
        || ! validLocations
        || ! validTags
    ) {
        throw createError(400);
    }

    const modelDelta = Listing.getI18nModelDelta(listing, updateAttrs, {
        locale: config.lang,
        fallbackLocale: config.lang,
    });
    updateAttrs = _.merge({}, updateAttrs, modelDelta);

    if (typeof updateAttrs.name !== "undefined" && !listing.validated) {
        updateAttrs.nameURLSafe = ToolsService.getURLStringSafe(updateAttrs.name);
    }

    let updatedListing = await Listing.updateOne(listing.id, Object.assign({}, updateAttrs));
    if (updateAttrs.tags) {
        updatedListing = await Listing.updateTags(updatedListing, updateAttrs.tags);
    }

    return updatedListing;
}

/**
 * @param {Number} listingId
 * @param {Object} params
 * @param {String} params.trigger
 * @param {Boolean} params.keepCommittedBookings
 * @param {Object} [options]
 * @param {Object} [options.req]
 * @param {Object} [options.res]
 * @param {Number} [options.userId] - if specified, check if the listing owner id matches the provided userId
 */
async function destroyListing(listingId, { trigger, keepCommittedBookings } = {}, { req, res, userId }) {
    const listing = await Listing.findOne({ id: listingId });
    if (!listing) {
        throw createError(404);
    }
    if (userId && listing.ownerId !== userId) {
        throw createError(403);
    }
    if (typeof keepCommittedBookings === 'undefined') {
        throw createError(400, 'Missing committed booking params');
    }

    const { allDestroyable } = await Listing.canBeDestroyed([listing], { keepCommittedBookings });
    if (!allDestroyable) {
        throw createError('Listing cannot be destroyed', {
            listingId,
            notDestroyable: true,
        });
    }

    await Listing.destroyListing(listing, { trigger }, { req, res });
}

/**
 * @param {Number} listingId
 * @param {Object} attrs
 * @param {Number[]} attrs.mediasIds
 * @param {String} attrs.mediaType
 * @param {Object} [options]
 * @param {Number} [options.userId]
 * @result {Object} updated listing
 */
async function updateListingMedias(listingId, { mediasIds, mediaType }, { userId } = {}) {
    if (!mediasIds || !MicroService.checkArray(mediasIds, 'id')) {
        throw createError(400);
    }
    if (!_.contains(['listing', 'instructions'], mediaType)) {
        throw createError(400);
    }
    if ((mediaType === 'listing' && Media.get('maxNb').listing < mediasIds.length)
     || (mediaType === 'instructions' && Media.get('maxNb').listingInstructions < mediasIds.length)
    ) {
        throw createError(400, 'Cannot set too many medias');
    }

    mediasIds = _.map(mediasIds, function (mediaId) {
        return parseInt(mediaId, 10);
    });

    const [
        listing,
        medias,
    ] = await Promise.all([
        Listing.findOne({ id: listingId }),
        Media.find({ id: MicroService.escapeListForQueries(mediasIds) }),
    ]);

    if (! listing
     || medias.length !== mediasIds.length
    ) {
        throw createError(404);
    }
    if (userId && listing.ownerId !== userId) {
        throw createError(403);
    }

    const areUserMedias = _.reduce(medias, (memo, media) => {
        if (listing.ownerId !== media.userId) {
            memo = memo && false;
        }
        return memo;
    }, true);

    if (!areUserMedias) {
        throw createError(403);
    }

    const updateAttrs = {};
    if (mediaType === 'listing') {
        updateAttrs.mediasIds = mediasIds;
    } else if (mediaType === 'instructions') {
        updateAttrs.instructionsMediasIds = mediasIds;
    }

    const updatedListing = await Listing.updateOne(listing.id, updateAttrs);
    return updatedListing;
}

/**
 * toggle listing paused state
 * @param  {Number} listingId
 * @param  {Object} attrs
 * @param  {Boolean} [attrs.pause] - can force state rather than toggling
 * @param  {String} [attrs.pausedUntil]
 * @param  {Object} [options]
 * @param  {Object} [options.req]
 * @param  {Object} [options.res]
 * @param  {Number} [options.userId]
 * @return {Promise<object>} listing
 */
async function pauseListingToggle(listingId, { pause, pausedUntil } = {}, { req, res, userId } = {}) {
    if (!listingId) {
        throw createError(400, 'listingId expected');
    }
    if (pausedUntil && !moment.isDate(pausedUntil)) {
        throw createError(400, 'Invalid date format');
    }

    const listing = await Listing.findOne({ id: listingId });

    if (!listing) {
        throw createError(404);
    }
    if (userId && listing.ownerId !== userId) {
        throw createError(403);
    }

    // Do not toggle listings locked by system
    if (listing.locked && !listing.pausedUntil) {
        return listing;
    }

    const untilDate   = (pausedUntil ? moment(pausedUntil) : moment().add(30, 'd')).format('YYYY-MM-DD');
    const pauseState  = _.isBoolean(pause) ? pause : (!listing.locked);
    const updateAttrs = {
        pausedUntil: (!listing.locked) ? untilDate : null,
        locked: pauseState
    };

    const updatedListing = await Listing.updateOne(listing.id, updateAttrs);

    const listingLocked = listing.locked && !listing.pausedUntil;

    let data;
    if (listingLocked) {
        data = { systemLocked: true };
    }

    await StelaceEventService.createEvent({
        req,
        res,
        label: pauseState ? 'listing.paused' : 'listing.unpaused',
        type: 'core',
        listingId: listing.id,
        data,
    });

    return updatedListing;
}

async function validateListing(listingId) {
    const listing = await Listing.findOne({ id: listingId });
    if (!listing) {
        throw createError(404);
    }
    if (listing.validated) {
        throw createError(400, 'Already validated');
    }

    const validatedListing = await Listing.updateOne(listingId, { validated: true });
    return validatedListing;
}

/**
 * @param {Object} attrs
 * @param {Number} attrs.listingId
 * @param {String} attrs.startDate
 * @param {String} attrs.endDate
 * @param {Number} attrs.quantity
 * @param {Object} [options]
 * @param {Number} [options.userId] - if specified, check if the listing owner id matches the provided userId
 */
async function createListingAvailability(attrs, { userId } = {}) {
    const {
        listingId,
        startDate,
        endDate,
        quantity,
    } = attrs;

    if (!startDate || !TimeService.isDateString(startDate)) {
        throw createError(400);
    }
    if (typeof quantity !== 'number' || quantity < 0) {
        throw createError(400);
    }

    const listing = await Listing.findOne({ id: listingId });
    if (!listing) {
        throw createError(404);
    }
    if (userId && listing.ownerId !== userId) {
        throw createError(403);
    }
    if (!listing.listingTypeId) {
        throw createError(403);
    }

    const listingType = await ListingTypeService.getListingType(listing.listingTypeId);
    if (!listingType) {
        throw createError(404);
    }

    const { TIME, AVAILABILITY } = listingType.properties;

    if (TIME === 'NONE') {
        throw createError(400);
    }
    if (AVAILABILITY === 'UNIQUE' && quantity > 1) {
        throw createError(400);
    }

    let createAttrs;

    if (TIME === 'TIME_PREDEFINED') {
        const [existingListingAvailability] = await ListingAvailability.find({
            listingId,
            type: 'date',
            startDate,
        }).limit(1);

        if (existingListingAvailability) {
            throw createError(400, 'Listing availability already exists');
        }

        createAttrs = {
            listingId,
            startDate,
            quantity,
            type: 'date',
        };
    } else {
        if (!endDate || !TimeService.isDateString(endDate)
         || endDate <= startDate
        ) {
            throw createError(400);
        }

        const listingAvailabilities = await ListingAvailability.find({ listingId, type: 'period' });

        if (TimeService.isIntersection(listingAvailabilities, { startDate, endDate })) {
            throw createError(400, 'Listing availability conflict');
        }

        createAttrs = {
            listingId,
            startDate,
            endDate,
            quantity,
            type: 'period',
        };
    }

    const listingAvailability = await ListingAvailability.create(createAttrs);
    return listingAvailability;
}

/**
 * @param {Object} attrs
 * @param {Number} attrs.listingId
 * @param {Number} attrs.listingAvailabilityId
 * @param {Number} attrs.quantity
 * @param {Object} [options]
 * @param {Number} [options.userId]
 */
async function updateListingAvailability({ listingId, listingAvailabilityId, quantity }, { userId } = {}) {
    const listing = await Listing.findOne({ id: listingId });
    if (!listing) {
        throw createError(404);
    }
    if (userId && listing.ownerId !== userId) {
        throw createError(403);
    }
    if (typeof quantity !== 'number' || quantity < 0) {
        throw createError(400);
    }

    const listingType = await ListingTypeService.getListingType(listing.listingTypeId);
    if (!listingType) {
        throw createError(404);
    }

    const { TIME, AVAILABILITY } = listingType.properties;

    if (TIME === 'NONE') {
        throw createError(400);
    }
    if (AVAILABILITY === 'UNIQUE' && quantity > 1) {
        throw createError(400);
    }

    const listingAvailability = await ListingAvailability.updateOne(listingAvailabilityId, { quantity });
    return listingAvailability;
}

/**
 * @param {Object} attrs
 * @param {Number} attrs.listingId
 * @param {Number} attrs.listingAvailabilityId
 * @param {Object} [options]
 * @param {Number} [options.userId]
 */
async function removeListingAvailability({ listingId, listingAvailabilityId }, { userId } = {}) {
    const listing = await Listing.findOne({ id: listingId });
    if (!listing) {
        throw createError(404);
    }
    if (userId && listing.ownerId !== userId) {
        throw createError(403);
    }

    await ListingAvailability.destroy({
        id: listingAvailabilityId,
        listingId: listing.id
    });
}
