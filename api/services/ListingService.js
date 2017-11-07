/*
    global StelaceEventService
*/

const {
    Listing,
} = require('../models_new');

module.exports = {

    pauseListingToggle: pauseListingToggle

};

var moment = require('moment');

/**
 * toggle listing paused state
 * @param  {ObjectId} options.listingId
 * @param  {boolean} [options.pause] - can force state rather than toggling
 * @param  {string} options.pausedUntil
 * @param  {object} options.req
 * @return {Promise<object>} listing
 */
function pauseListingToggle({ listingId, pause, pausedUntil, req, res }) {
    if (! listingId) {
        throw new BadRequestError("listingId expected");
    }
    if (pausedUntil && ! moment.isDate(pausedUntil)) {
        throw new BadRequestError("Invalid date format");
    }

    return Promise.coroutine(function* () {
        var listing = yield Listing.findById(listingId);

        if (! listing) {
            throw new NotFoundError();
        }
        if (! req.user || !µ.isSameId(listing.ownerId, req.user.id)) {
            throw new ForbiddenError();
        }

        // Do not toggle listings locked by system
        if (listing.locked && ! listing.pausedUntil) {
            return listing;
        }

        var untilDate   = (pausedUntil ? moment(pausedUntil) : moment().add(30, "d")).format("YYYY-MM-DD");
        var pauseState  = _.isBoolean(pause) ? pause : (! listing.locked);
        var updateAttrs = {
            pausedUntil: (! listing.locked) ? untilDate : null,
            locked: pauseState
        };

        var updatedListing = yield Listing.findByIdAndUpdate(listing.id, updateAttrs, { new: true });

        const listingLocked = listing.locked && ! listing.pausedUntil;
        let data;

        if (listingLocked) {
            data = { systemLocked: true };
        }

        yield StelaceEventService.createEvent({
            req: req,
            res: res,
            label: pauseState ? 'listing.paused' : 'listing.unpaused',
            type: 'core',
            listingId: listing.id,
            data,
        });

        return updatedListing;
    })();
}
