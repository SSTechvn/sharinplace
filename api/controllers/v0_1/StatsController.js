/* global StatsService */

const {
    Booking,
    Listing,
    User,
} = require('../../models_new');

module.exports = {

    userRegistered,
    listingPublished,
    bookingPaid,

};

async function userRegistered(req, res) {
    let { startDate, endDate } = req.allParams();

    try {
        if (!StatsService.isValidPeriodDates(startDate, endDate)) {
            throw new BadRequestError();
        }

        const upperEndDate = StatsService.getDayAfter(endDate);

        const users = await User
            .find({
                destroyed: false,
                createdDate: {
                    $gte: startDate,
                    $lt: upperEndDate,
                },
            })
            .sort({ createdDate: 1 });

        const dates = _.pluck(users, 'createdDate');

        const countDate = StatsService.getDateCount(dates, { startDate, endDate });

        res.json(countDate);
    } catch (err) {
        res.sendError(err);
    }
}

async function listingPublished(req, res) {
    let { startDate, endDate } = req.allParams();

    try {
        if (!StatsService.isValidPeriodDates(startDate, endDate)) {
            throw new BadRequestError();
        }

        const upperEndDate = StatsService.getDayAfter(endDate);

        const listings = await Listing
            .find({
                createdDate: {
                    $gte: startDate,
                    $lt: upperEndDate,
                },
            })
            .sort({ createdDate: 1 });

        const dates = _.pluck(listings, 'createdDate');

        const countDate = StatsService.getDateCount(dates, { startDate, endDate });

        res.json(countDate);
    } catch (err) {
        res.sendError(err);
    }
}

async function bookingPaid(req, res) {
    let { startDate, endDate } = req.allParams();

    try {
        if (!StatsService.isValidPeriodDates(startDate, endDate)) {
            throw new BadRequestError();
        }

        const upperEndDate = StatsService.getDayAfter(endDate);

        const bookings = await Booking
            .find({
                paidDate: {
                    $gte: startDate,
                    $lt: upperEndDate,
                },
            })
            .sort({ paidDate: 1 });

        const dates = _.pluck(bookings, 'paidDate');

        const countDate = StatsService.getDateCount(dates, { startDate, endDate });

        res.json(countDate);
    } catch (err) {
        res.sendError(err);
    }
}
