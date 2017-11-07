/* global GamificationService */

const {
    User,
} = require('../models_new');

/**
 * GamificationController
 *
 * @description :: Server-side logic for managing gamifications
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    params: params,
    getStats: getStats,
    updateProgressView: updateProgressView

};

function params(req, res) {
    var levelsOrder = GamificationService.getLevelsOrder();
    var levels      = GamificationService.getLevels();
    var badges      = GamificationService.getBadges();
    var actions     = GamificationService.getActions();

    var result = {};

    result.levelsOrder = levelsOrder;

    result.levels = _.reduce(levels, (memo, level, levelId) => {
        memo[levelId] = _.pick(level, ["id", "requirements"]);
        return memo;
    }, {});

    result.badges = _.reduce(badges, (memo, badge, badgeId) => {
        memo[badgeId] = _.pick(badge, ["id"]);
        return memo;
    }, {});

    result.actions = _.reduce(actions, (memo, action, actionId) => {
        memo[actionId] = _.pick(action, ["id", "points", "suggestionOrder", "actionType", "once", "rewards"]);
        return memo;
    }, {});

    res.json(result);
}

function getStats(req, res) {
    return Promise
        .resolve()
        .then(() => {
            return GamificationService.getUsersStats([req.user]);
        })
        .then(usersStats => {
            var userStats = usersStats[req.user.id];

            var exposedStats = {
                points: userStats.points,
                levelId: userStats.levelId,
                lastViewedPoints: req.user.lastViewedPoints,
                lastViewedLevelId: req.user.lastViewedLevelId,
                badges: userStats.badges,
                actions: userStats.actions,
                lastActions: userStats.lastActions,
                nextLevelId: userStats.nextLevelId,
                levelsPoints: userStats.levelsPoints
            };

            res.json(exposedStats);
        })
        .catch(res.sendError);
}

function updateProgressView(req, res) {
    var points  = req.param("points");
    var levelId = req.param("levelId");

    var access = "self";

    var updateAttrs = {};

    if (points) {
        updateAttrs.lastViewedPoints = req.user.points;
    }
    if (levelId) {
        updateAttrs.lastViewedLevelId = req.user.levelId;
    }

    return Promise
        .resolve()
        .then(() => {
            return User.findByIdAndUpdate(req.user.id, updateAttrs, { new: true });
        })
        .then(user => {
            res.json(User.expose(user, access));
        })
        .catch(res.sendError);
}
