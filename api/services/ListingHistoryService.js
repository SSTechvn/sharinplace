const {
    Booking,
    Listing,
    Rating,
} = require('../models_new');

module.exports = {

    getListingHistories: getListingHistories,
    ListingHistory: ListingHistory,

};

async function getListingHistories(listingsIds) {
    const bookings = await Listing.getBookings(listingsIds);
    const bookingsIds = _.pluck(bookings, 'id');

    const [
        hashBookings,
        ratings,
    ] = await Promise.all([
        Booking.getAssessments(bookings),
        Rating.find({ bookingId: bookingsIds }),
    ]);

    const groupBookings = _.groupBy(bookings, 'listingId');
    const groupRatings = _.groupBy(ratings, 'bookingId');

    return _.reduce(listingsIds, (memo, listingId) => {
        const listingBookings = groupBookings[listingId] || [];
        memo[listingId] = new ListingHistory(listingBookings, {
            hashBookings,
            groupRatings,
        });
        return memo;
    }, {});
}


/**
 * Listing history represents the history of a listing booking after booking
 * It is composed of steps.
 *
 * step = object with
 * - index history
 * - booking
 * - input assessment (not always defined)
 * - output assessment (not always defined)
 * - ratings
 *
 */
function ListingHistory(bookings, { hashBookings, groupRatings }) {
    this.steps = [];

    if (! bookings.length) {
        return;
    }

    _.forEach(bookings, booking => {
        var hashBooking = hashBookings[booking.id];
        const step = {
            index: this.steps.length,
            booking,
            inputAssessment: hashBooking.inputAssessment,
            outputAssessment: hashBooking.outputAssessment,
            ratings: groupRatings[booking.id] || [],
        };
        this.steps.push(step);
    });
}

/**
 * get the list of assessments of the listing history
 * @param  {boolean}  [signed = false]
 * @return {object[]} assessments
 */
ListingHistory.prototype.getAssessments = function ({ signed = false } = {}) {
    return _.reduce(this.steps, (memo, step) => {
        if (step.inputAssessment && matchSignCondition(step.inputAssessment, signed)) {
            memo.push(step.inputAssessment);
        }
        if (step.outputAssessment && matchSignCondition(step.outputAssessment, signed)) {
            memo.push(step.outputAssessment);
        }
        return memo;
    }, []);
};

function matchSignCondition(assessment, signed) {
    if (!signed) {
        return true;
    }

    return !!assessment.signedDate;
}

ListingHistory.prototype.getBeforeAssessment = function (assessmentId) {
    var reversedAssessments = this.getAssessments().reverse();

    var index = _.findIndex(reversedAssessments, assessment => µ.isSameId(assessment.id, assessmentId));

    // no assessment found
    if (index === -1) {
        return;
    }

    // find the first signed assessment after the selected assessment
    return _.find(reversedAssessments.slice(index + 1), assessment => !! assessment.signedDate);
};

ListingHistory.prototype.getLastSignedAssessment = function () {
    return _.last(this.getAssessments({ signed: true }));
};

/**
 * get ratings from assessment
 * @param  {ObjectId}  assessmentId
 *
 * @return {object[]} ratings
 */
ListingHistory.prototype.getRatings = function (assessmentId) {
    const step = _.find(this.steps, step => {
        return this.isInputAssessment(step, assessmentId)
            || this.isOutputAssessment(step, assessmentId);
    });

    if (!step) {
        return [];
    }

    return step.ratings;
};

ListingHistory.prototype.isInputAssessment = function (step, assessmentId) {
    return step.inputAssessment && µ.isSameId(step.inputAssessment.id, assessmentId);
};

ListingHistory.prototype.isOutputAssessment = function (step, assessmentId) {
    return step.outputAssessment && µ.isSameId(step.outputAssessment.id, assessmentId);
};
