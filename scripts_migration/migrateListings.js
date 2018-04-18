/* global BootstrapService, Listing */

const Sails = require('sails');
const { getConfig } = require('../sailsrc');

const Promise = require('bluebird');

Sails.load(getConfig(), async function (err, sails) {
    if (err) {
        console.log("\n!!! Fail script launch: can't load sails");
        return;
    }

    BootstrapService.init(null, { sails: sails });

    try {
        const listings = await Listing.find();

        await Promise.each(listings, listing => {
            return Listing.updateOne(listing.id, {
                listingTypeId: listing.listingTypesIds[0],
            });
        });
    } catch (err) {
        console.log(err);

        if (err.stack) {
            console.log(err.stack);
        }
    } finally {
        sails.lowerSafe();
    }

});
