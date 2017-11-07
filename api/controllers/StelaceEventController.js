/* global GamificationService, StelaceEventService */

const {
    StelaceEvent,
    StelaceSession,
    User,
} = require('../models_new');

/**
 * StelaceEventController
 *
 * @description :: Server-side logic for managing stelace events
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    findOne: findOne,

    createEvent: createEvent,
    updateEvent: updateEvent

};

var moment = require('moment');

function findOne(req, res) {
    // to fix googlebot dumb request
    return res.ok();
}

function createEvent(req, res) {
    var params = req.allParams();
    params.req = req;
    params.res = res;

    if (! params.label) {
        return res.ok();
    }

    return Promise.coroutine(function* () {
        var stelaceInfo = yield StelaceEventService.createEvent(params);
        var stelaceSession = stelaceInfo.stelaceSession;
        var stelaceEvent   = stelaceInfo.stelaceEvent;

        if (req.user && req.user.id) {
            setGamification(req.user.id, stelaceEvent, req.logger, req);
        }

        res.json({
            sessionId: stelaceSession.id,
            sessionToken: stelaceSession.token,
            eventId: stelaceEvent.id,
            eventToken: stelaceEvent.token
        });
    })()
    .catch(() => res.ok());



    function setGamification(userId, stelaceEvent, logger, req) {
        return Promise.coroutine(function* () {
            var actionsIds  = [];
            var actionsData = {};

            if (actionsIds.length) {
                var user = yield User.findById(userId);
                if (user) {
                    yield GamificationService.checkActions(user, actionsIds, actionsData, logger, req);
                }
            }
        })()
        .catch(() => { /* do nothing */ });
    }
}

function updateEvent(req, res) {
    var id = req.param("id");
    var token = req.param("token");
    var filteredAttrs = [
        "width",
        "height",
        "srcUrl",
        "scrollPercent",
        "data"
    ];
    var updateAttrs = _.pick(req.allParams(), filteredAttrs);

    if (! token) {
        return res.ok();
    }

    var now = moment().toISOString();

    return Promise.coroutine(function* () {
        updateAttrs = StelaceEventService.extractFromData(updateAttrs);

        var stelaceEvent = yield StelaceEvent.updateOne(
            {
                _id: id,
                token: token
            },
            updateAttrs
        );

        yield StelaceSession.findByIdAndUpdate(stelaceEvent.sessionId, { lastEventDate: now }, { new: true });
    })()
    .then(() => res.ok())
    .catch(() => res.ok());
}
