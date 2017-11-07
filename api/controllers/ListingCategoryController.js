/* global TokenService */

const {
    Brand,
    ListingCategory,
} = require('../models_new');

/**
 * ListingCategoryController
 *
 * @description :: Server-side logic for managing listingcategories
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {

    find: find,
    findOne: findOne,
    create: create,
    update: update,
    destroy: destroy

};

function find(req, res) {
    var access = "others";

    return ListingCategory
        .find()
        .then(listingCategories => {
            res.json(ListingCategory.exposeAll(listingCategories, access));
        })
        .catch(res.sendError);
}

function findOne(req, res) {
    var id = req.param("id");
    var access = "others";

    return ListingCategory
        .findById(id)
        .then(listingCategory => {
            if (! listingCategory) {
                throw new NotFoundError();
            }

            res.json(ListingCategory.expose(listingCategory, access));
        })
        .catch(res.sendError);
}

function create(req, res) {
    var name     = req.param("name");
    var parentId = req.param("parentId");
    var access = "admin";

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }

    return Promise
        .resolve()
        .then(() => {
            return [
                ListingCategory.findOne({ name: name }),
                parentId ? ListingCategory.findById(parentId) : null
            ];
        })
        .spread((listingCategory, parentCategory) => {
            if (listingCategory) {
                throw new BadRequestError("category already exists");
            }
            if (parentId && ! parentCategory) {
                throw new BadRequestError("parent category not exist");
            }

            var createAttrs = {
                name: name,
                parentId: parentId
            };

            return ListingCategory.create(createAttrs);
        })
        .then(listingCategory => {
            res.json(ListingCategory.expose(listingCategory, access));
        })
        .catch(res.sendError);
}

function update(req, res) {
    var id = req.param("id");
    var name = req.param("name");
    var access = "admin";

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }
    if (! name) {
        return res.badRequest();
    }

    var updateAttrs = {
        name: name
    };

    return ListingCategory
        .findByIdAndUpdate(id, updateAttrs, { new: true })
        .then(listingCategory => {
            res.json(ListingCategory.expose(listingCategory, access));
        })
        .catch(res.sendError);
}

// !!! Before destroying listing category, check if any brand is associated with it or its children
function destroy(req, res) {
    var id = req.param("id");

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }

    return Promise
        .resolve()
        .then(() => {
            return Brand.find();
        })
        .then(brands => {
            return removeListingCategoryFromBrands(id, brands);
        })
        .then(() => {
            return ListingCategory.removeListingCategory(id);
        })
        .then(() => res.json({ id }))
        .catch(res.sendError);



    function removeListingCategoryFromBrands(id, brands) {
        return Promise
            .resolve(brands)
            .each(brand => {
                if (! brand.listingCategories || !µ.includesObjectId(brand.listingCategories, id)) {
                    return;
                }

                return Brand.findByIdAndUpdate(brand.id, { listingCategories: _.without(brand.listingCategories, id) }, { new: true });
            });
    }
}

