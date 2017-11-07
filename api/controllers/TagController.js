/* global ElasticsearchService, TokenService */

const {
    ListingXTag,
    Tag,
    User,
    UserXTag,
} = require('../models_new');

/**
 * TagController
 *
 * @description :: Server-side logic for managing tags related to listings or users
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    find: find,
    create: create,
    destroy: destroy

};

function find(req, res) {
    var access = "others";
    // TODO manage array of Ids
    // var listingCategoryId = req.param("listingCategoryId");

    var findAttrs = {};

    // if (listingCategoryId) {
    //     findAttrs.listingCategoryId = listingCategoryId;
    // }

    return Tag
        .find(findAttrs)
        .sort({ nameURLSafe: 1 })
        .then(tags => {
            res.json(Tag.exposeAll(tags, access));
        })
        .catch(res.sendError);
}

function create(req, res) {
    var filteredAttrs = [
        "name",
        "listingCategoryIds"
    ];
    var createAttrs = _.pick(req.allParams(), filteredAttrs);
    var access = "others";

    if (! createAttrs.name) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Tag.findOne({ name: createAttrs.name });
        })
        .then(tag => {
            if (! tag) {
                return Tag.create(createAttrs);
            } else {
                return tag;
            }
        })
        .then(tag => {
            res.json(Tag.expose(tag, access));
        })
        .catch(res.sendError);
}

function destroy(req, res) {
    var isAdmin = TokenService.isRole(req, "admin");
    var tagId   = req.param("id");
    var tagUsersIds;
    var tagUsers;

    if (! isAdmin) {
        return res.forbidden();
    } else if (! tagId) {
        return res.badRequest();
    }

    return Promise.coroutine(function* () {
        var tag = yield Tag.findById(tagId);

        if (! tag) {
            return res.notFound();
        }

        var tagUse = yield Promise.props({
            userTags: UserXTag.find({ tagId: tagId }),
            listingTags: ListingXTag.find({ tagId: tagId })
        });

        tagUsersIds  = _.pluck(tagUse.userTags, "userId");
        tagUsers     = yield User.find({ _id: tagUsersIds });
        var updates  = [];

        _.forEach(tagUsers, function (user) {
            if (!µ.includesObjectId(user.tagsIds, tagId)) {
                return; // sanity check
            }
            var updatedTagsIds = _.reject(user.tagsIds, id => µ.isSameId(id, tagId));

            updates.push(User.findByIdAndUpdate(user.id, { tagsIds: updatedTagsIds }, { new: true }));
        });

        yield Promise.all(updates);

        yield Promise.all([
            Tag.remove({ _id: tagId }),
            UserXTag.remove({ tagId: tagId }),
            ListingXTag.remove({ tagId: tagId })
        ]);

        var listingsIds = _.pluck(tagUse.listingTags, "listingId");
        ElasticsearchService.shouldSyncListings(listingsIds);

        return res.json({
            nbUsers: tagUse.userTags.length,
            nbListings: tagUse.listingTags.length
        });
    })()
    .catch(res.sendError);
}
