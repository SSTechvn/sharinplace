/* global SeoSnapshotService, StelaceConfigService, StelaceEventService, TokenService, ToolsService, UAService */

/**
 * AppController
 *
 * @description :: Server-side logic for managing apps
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

const {
    Listing,
    Tag,
    Token,
    User,
} = require('../models_new');

module.exports = {

    index: index,
    oldBrowsers: oldBrowsers

};

const Url         = require('url');
const querystring = require('querystring');
const UrlPattern  = require('url-pattern');

var SeoSnapshot = SeoSnapshotService.init({
    snapshotsDirPath: sails.config.snapshotsDir,
    saveInterval: 300000
});

var seoPatterns = null;
var oldSearchPatterns;

var clientTracking = sails.config.clientTracking;

function index(req, res) {
    var userAgent = req.headers["user-agent"];

    var isSnapshotCrawler = UAService.isBot(userAgent, ["phantomjs"]);

    var serveSnapshot = ! isSnapshotCrawler
        && (typeof req.query._escaped_fragment_ !== "undefined"
          || UAService.isBot(userAgent)
        );

    if (serveSnapshot) {
        if (req.method !== "GET") {
            return res.forbidden();
        } else {
            return SeoSnapshot.serveSnapshot(sails.config.stelace.url, req.url, req, res);
        }
    }

    if (UAService.isOldBrowser(userAgent)) {
        return oldBrowsers(req, res);
    }

    return Promise.coroutine(function* () {
        // auth token
        if (req.query.aut) {
            var redirectedUrl = removeQueryParam(req.url, "aut");

            yield setAuthToken({
                queryToken: req.query.aut,
                userAgent,
                req,
                res,
            }).catch(() => null);

            return res.redirect(redirectedUrl);
        }

        const newListingSearchUrl = getNewListingSearchUrl(req.url);
        if (newListingSearchUrl) {
            return res.redirect(newListingSearchUrl);
        }

        const config = yield StelaceConfigService.getConfig();
        const features = yield StelaceConfigService.getListFeatures();

        var eventActive = yield StelaceConfigService.isFeatureActive('EVENTS');
        var stelaceEventData = eventActive ? yield getStelaceEventData(req, res) : {};

        var stelaceSession = stelaceEventData.stelaceSession;
        var stelaceEvent   = stelaceEventData.stelaceEvent;

        var seoConfig = yield getSeoConfig(req.url);

        const dataFromServer = {
            config,
            features,
        };

        var viewParams = {
            layout: "layouts/app",
            env: "prod",
            facebookAppId: sails.config.facebookAppId,
            facebookTracking: clientTracking && clientTracking.facebook,
            googleTracking: clientTracking && clientTracking.google,
            facebookPixelId: clientTracking && clientTracking.facebookPixelId,
            googleAnalyticsId: clientTracking && clientTracking.googleAnalyticsId,
            sessionId: stelaceSession ? stelaceSession.id : 0,
            sessionToken: stelaceSession ? stelaceSession.token : "",
            eventId: stelaceEvent ? stelaceEvent.id : 0,
            eventToken: stelaceEvent ? stelaceEvent.token : "",
            uxVersion: StelaceEventService.getCurrentVersion(),
            devHighlightTranslations: sails.config.highlightTranslations ? "dev-highlight-translations" : "",
            featureDetection: ! UAService.isBot(userAgent),
            googleMapApiKey: sails.config.googleMapApiKey,
            dataFromServer: JSON.stringify(dataFromServer || {}),
        };

        if (sails.config.environment === "production") {
            viewParams.env = "prod";
        } else if (sails.config.environment === "pre-production") {
            viewParams.env = "preprod";
        } else {
            viewParams.env = "dev";
        }

        viewParams = _.extend(viewParams, seoConfig);

        res
            .set({ "Cache-Control": "no-cache" })
            .view(viewParams);
    })();



    async function setAuthToken({
        queryToken,
        userAgent,
        listingId,
        req,
        res,
    }) {
        let tokens;
        let token;

        if (listingId) {
            tokens = await Token.find({
                type: 'authToken',
                value: queryToken,
            });

            token = _.find(tokens, token => {
                return token.reference && µ.isSameId(token.reference.listingId, listingId);
            });
        } else {
            token = await Token.findOne({
                type: 'authToken',
                value: queryToken,
            });
        }

        if (!token || !token.userId) {
            return;
        }

        const isExpiredToken = token.expirationDate && token.expirationDate < new Date();

        // stop if token has expired
        if (isExpiredToken) {
            return;
        }

        const user = await User.findById(token.userId);
        if (!user) {
            return;
        }

        const authToken = TokenService.createAuthToken(user, { userAgent });

        // must set an expiration date because otherwise the cookie isn't removed from some client views
        // such as views with Google Maps (e.g. listing view)
        res.cookie('setAuthToken', authToken, {
            expires: new Date(new Date().getTime() + 3600),
        });

        const data = {
            passwordless: true
        };

        const config = {
            req: req,
            res: res,
            label: 'user.logged_in',
            defaultUserId: user.id,
            data: data,
            type: 'core',
        };

        StelaceEventService.createEvent(config);

        return true;
    }

    function getStelaceEventData(req, res) {
        return Promise.coroutine(function* () {
            // angular animate bugs ?
            if (req.url === "/undefined") {
                return {};
            }

            // angular get media when the url hasn't resolved
            if (_.startsWith(req.url, "/?size=")) {
                return {};
            }

            return yield StelaceEventService.createEvent({
                req: req,
                res: res,
                label: "Fetch page"
            });
        })();
    }

    function removeQueryParam(requestedUrl, paramName) {
        var urlObject = Url.parse(requestedUrl);
        var params   = querystring.parse(urlObject.query);
        delete params[paramName];

        if (_.keys(params).length) {
            return urlObject.pathname + "?" + querystring.stringify(params);
        } else {
            return urlObject.pathname;
        }
    }

    function getNewListingSearchUrl(url) {
        if (!oldSearchPatterns) {
            oldSearchPatterns = {
                searchWithLocation: new UrlPattern('/s/l/:location'),
                searchWithTagAndLocation: new UrlPattern('/s/:tag/l/:location'),
            };
        }

        const parsedUrl = Url.parse(url, true);

        let tokens;

        tokens = oldSearchPatterns.searchWithLocation.match(parsedUrl.pathname);
        if (tokens) {
            const q = _.assign({ l: tokens.location }, parsedUrl.query);
            const strQ = querystring.stringify(q);
            return `/s?${strQ}`;
        }

        tokens = oldSearchPatterns.searchWithTagAndLocation.match(parsedUrl.pathname);
        if (tokens) {
            const q = _.assign({ l: tokens.location }, parsedUrl.query);
            const strQ = querystring.stringify(q);
            return `/s/${tokens.tag}?${strQ}`;
        }
    }

    function getSeoConfig(requestedUrl) {
        var urlObject = Url.parse(requestedUrl);
        var pathname = urlObject.pathname;
        var params   = querystring.parse(urlObject.query);

        var seoConfig = {};

        // normalize url
        if (pathname !== "/" && pathname.slice(-1) === "/") {
            pathname = pathname.slice(0, -1);
        }

        if (! seoPatterns) {
            seoPatterns = initSeoPatterns();
        }

        return Promise.coroutine(function* () {
            var results = getPatternConfig(seoPatterns, pathname);

            if (! results) {
                return seoConfig;
            }

            var config = results.config;
            var tokens = results.tokens;

            if (! config.resolve) {
                seoConfig.canonicalUrl = null;
            } else if (config.resolve === true) {
                seoConfig.canonicalUrl = config.pattern;
            } else if (typeof config.resolve === "string") {
                seoConfig.canonicalUrl = config.resolve;
            } else if (typeof config.resolve === "function") {
                seoConfig.canonicalUrl = yield Promise.resolve()
                    .then(() => config.resolve(tokens, params))
                    .catch(() => null);
            }

            if (config.noindex) {
                seoConfig.metaRobotsTags = "noindex";
            }

            // do not set canonical if the requested url is the canonical
            if (seoConfig.canonicalUrl === requestedUrl) {
                seoConfig.canonicalUrl = null;
            }

            if (seoConfig.canonicalUrl) {
                seoConfig.canonicalUrl = sails.config.stelace.url + (seoConfig.canonicalUrl !== "/" ? seoConfig.canonicalUrl : "");
            }

            return seoConfig;
        })();



        function initSeoPatterns() {
            var seoPatterns = [
                {
                    pattern: "/",
                    resolve: true
                },
                {
                    pattern: "/register",
                    resolve: true
                },
                {
                    pattern: "/login",
                    resolve: true
                },
                {
                    pattern: "/social-auth",
                    resolve: true
                },
                {
                    pattern: "/lost-password",
                    resolve: true
                },
                {
                    pattern: "/listing/new",
                    resolve: true
                },
                {
                    pattern: "/terms",
                    resolve: true
                },
                {
                    pattern: "/contact",
                    resolve: true
                },
                {
                    pattern: "/help",
                    resolve: true
                },
                {
                    pattern: "/invite",
                    resolve: true
                },
                {
                    pattern: "/404",
                    resolve: true,
                    noindex: true
                },
                {
                    pattern: "/user/:id",
                    resolve: tokens => {
                        const userId = tokens.id;
                        if (!µ.isMongoId(userId)) {
                            return;
                        } else {
                            return `/user/${userId}`;
                        }
                    }
                },
                {
                    pattern: "/listing/:slug",
                    resolve: tokens => {
                        var slugId = _.last(tokens.slug.split("-"));
                        if (! slugId || !µ.isMongoId(slugId)) {
                            return;
                        }

                        return Promise.coroutine(function* () {
                            var listing = yield Listing.findById(slugId);
                            if (! listing) {
                                return;
                            } else {
                                return `/listing/${listing.nameURLSafe}-${slugId}`;
                            }
                        })();
                    }
                },
                {
                    pattern: "/friend/:slug",
                    resolve: tokens => {
                        var slugId = _.last(tokens.slug.split("-"));

                        if (! slugId || !µ.isMongoId(slugId)) {
                            return;
                        } else {
                            return `/friend/${slugId}`;
                        }
                    }
                },
                {
                    pattern: "/my-listings",
                    resolve: true
                },
                {
                    pattern: "/s",
                    resolve: searchResolve
                },
                {
                    pattern: "/s/:tag",
                    resolve: searchResolve
                },
                {
                    pattern: "/s/l/:location",
                    resolve: searchResolve
                },
                {
                    pattern: "/s/:tag/l/:location",
                    resolve: searchResolve
                },
                {
                    pattern: "/recovery-password/:tokenId/:tokenValue",
                    resolve: false,
                    noindex: true
                },
                {
                    pattern: "/email-check",
                    resolve: true,
                    noindex: true
                }
            ];

            seoPatterns = _.reduce(seoPatterns, (memo, config) => {
                var isTokenUrl = (config.pattern.indexOf(":") !== -1);

                if (isTokenUrl) {
                    config.urlPattern = new UrlPattern(config.pattern);
                }

                memo.push(config);
                return memo;
            }, []);

            return seoPatterns;


            function searchResolve(tokens, params) {
                return Promise.coroutine(function* () {
                    var tag = tokens.tag ? ToolsService.getURLStringSafe(tokens.tag).toLowerCase() : null;

                    var tags;
                    if (tag) {
                        tags = yield Tag.find().catch(() => []);
                        tag = _.find(tags, t => t.nameURLSafe.toLowerCase() === tag);
                        tag = tag.nameURLSafe;
                    }

                    var url = `/s`;

                    if (tag) {
                        url += `/${tag}`;
                    }

                    var paramsObj = {};

                    if (params.page && params.page !== "1") {
                        paramsObj.page = params.page;
                    }

                    var paramsStr = querystring.stringify(paramsObj);
                    return url + (paramsStr ? "?" + paramsStr : "");
                })();
            }
        }

        function getPatternConfig(seoPatterns, pathname) {
            return _.reduce(seoPatterns, (memo, config) => {
                if (memo) {
                    return memo;
                }

                if (config.urlPattern) {
                    var tokens = config.urlPattern.match(pathname);
                    if (tokens) {
                        memo = {
                            config: config,
                            tokens: tokens
                        };
                    }
                } else if (config.pattern === pathname) {
                    memo = {
                        config: config
                    };
                }
                return memo;
            }, null);
        }
    }
}

function oldBrowsers(req, res) {
    return res
        .set({ "Cache-Control": "public, max-age=2592000" })
        .view("old_browsers", {
            title: "Please upgrade your browser",
            layout: "layouts/nothing"
        });
}
