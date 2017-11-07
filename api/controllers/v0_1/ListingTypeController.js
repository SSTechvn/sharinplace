/* global ApiService */

const {
    ListingType,
} = require('../../models_new');

module.exports = {

    find,
    findOne,

};

async function find(req, res) {
    const access = 'self';
    const attrs = req.allParams();

    try {
        const pagination = ApiService.parsePagination(attrs);

        const [
            listingTypes,
            countListingTypes,
        ] = await Promise.all([
            ListingType.find().skip(pagination.skip).limit(pagination.limit),
            ListingType.count(),
        ]);

        const returnedObj = ApiService.getPaginationMeta({
            totalResults: countListingTypes,
            limit: pagination.limit,
        });
        returnedObj.results = ListingType.exposeAll(listingTypes, access);

        res.json(returnedObj);
    } catch (err) {
        res.sendError(err);
    }
}

async function findOne(req, res) {
    const id = req.param('id');
    const access = 'self';

    try {
        const listingType = await ListingType.findById(id);
        if (!listingType) {
            throw new NotFoundError();
        }

        res.json(ListingType.expose(listingType, access));
    } catch (err) {
        res.sendError(err);
    }
}
