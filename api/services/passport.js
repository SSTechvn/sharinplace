/* global EmailTemplateService, StelaceConfigService, StelaceEventService */

var fs       = require('fs');
var path     = require('path');
var url      = require('url');
var passport = require('passport');
var request  = require('request');
var uuid     = require('uuid');
var gm       = require('gm');

const {
    Media,
    Passport,
    User,
} = require('../models_new');

Promise.promisifyAll(fs);
Promise.promisifyAll(request, { multiArgs: true });

/**
 * Passport Service
 *
 * A painless Passport.js service for your Sails app that is guaranteed to
 * Rock Your Socks™. It takes all the hassle out of setting up Passport.js by
 * encapsulating all the boring stuff in two functions:
 *
 *   passport.endpoint()
 *   passport.callback()
 *
 * The former sets up an endpoint (/auth/:provider) for redirecting a user to a
 * third-party provider for authentication, while the latter sets up a callback
 * endpoint (/auth/:provider/callback) for receiving the response from the
 * third-party provider. All you have to do is define in the configuration which
 * third-party providers you'd like to support. It's that easy!
 *
 * Behind the scenes, the service stores all the data it needs within "Pass-
 * ports". These contain all the information required to associate a local user
 * with a profile from a third-party provider. This even holds true for the good
 * ol' password authentication scheme – the Authentication Service takes care of
 * encrypting passwords and storing them in Passports, allowing you to keep your
 * User model free of bloat.
 */

// Load authentication protocols
passport.protocols = require('./protocols');

/**
 * Connect a third-party profile to a local user
 *
 * This is where most of the magic happens when a user is authenticating with a
 * third-party provider. What it does, is the following:
 *
 *   1. Given a provider and an identifier, find a mathcing Passport.
 *   2. From here, the logic branches into two paths.
 *
 *     - A user is not currently logged in:
 *       1. If a Passport wassn't found, create a new user as well as a new
 *          Passport that will be assigned to the user.
 *       2. If a Passport was found, get the user associated with the passport.
 *
 *     - A user is currently logged in:
 *       1. If a Passport wasn't found, create a new Passport and associate it
 *          with the already logged in user (ie. "Connect")
 *       2. If a Passport was found, nothing needs to happen.
 *
 * As you can see, this function handles both "authentication" and "authori-
 * zation" at the same time. This is due to the fact that we pass in
 * `passReqToCallback: true` when loading the strategies, allowing us to look
 * for an existing session in the request and taking action based on that.
 *
 * For more information on auth(entication|rization) in Passport.js, check out:
 * http://passportjs.org/guide/authenticate/
 * http://passportjs.org/guide/authorize/
 *
 * @param {Object}   req
 * @param {Object}   query
 * @param {Object}   profile
 * @param {Function} next
 */
passport.connect = function (req, query, profile, next) {
    var user = {};

    // Set the authentication provider.
    query.provider = req.param("provider");

    return Promise.coroutine(function* () {
        if (! query.provider || ! query.identifier) {
            throw new BadRequestError("not valid passport info");
        }

        const activeSocialLogin = yield StelaceConfigService.isFeatureActive('SOCIAL_LOGIN');
        if (!activeSocialLogin) {
            throw new ForbiddenError('Social login disabled');
        }

        var passport = yield Passport.findOne({
            provider: query.provider,
            identifier: query.identifier.toString()
        });

        if (! req.user) {
            if (! passport) {
                // Scenario: A new user is attempting to sign up using a third-party
                //           authentication provider.
                // Action:   Create a new user and assign them a passport.
                return yield createNewUser(user, query, profile);
            } else {
                // Scenario: An existing user is trying to log in using an already
                //           connected passport.
                // Action:   Get the user associated with the passport.
                return yield useExistingPassport(passport, query);
            }
        } else {
            if (! passport) {
                // Scenario: A user is currently logged in and trying to connect a new
                //           passport.
                // Action:   Create and assign a new passport to the user.
                return yield connectNewPassport(query, req);
            } else {
                // Scenario: The user is a nutjob or spammed the back-button.
                // Action:   Simply pass along the already established session.
                return req.user;
            }
        }
    })()
    .asCallback(next);



    function createNewUser(userCreateAttrs, query, profile) {
        userCreateAttrs = userCreateAttrs || {};

        // If the profile object contains a list of emails, grab the first one and
        // add it to the user.
        if (profile.emails && profile.emails.length && profile.emails[0].value) {
            user.email = profile.emails[0].value.toLowerCase();
        }
        // If the profile object contains a username, add it to the user.
        if (profile.username) {
            user.username = profile.username;
        }

        if (profile.name && profile.name.givenName) {
            user.firstname = profile.name.givenName;
        }
        if (profile.name && profile.name.familyName) {
            user.lastname = profile.name.familyName;
        }

        return User
            .create(userCreateAttrs)
            .catch(err => {
                if (err.code === "E_VALIDATION") {
                    var error;

                    if (err.invalidAttributes.email) {
                        error = new BadRequestError("email exists");
                        error.expose = true;
                    } else {
                        error = new Error("user exists");
                    }

                    throw error;
                } else {
                    throw err;
                }
            })
            .then(user => {
                query.userId = user.id;

                return [
                    user,
                    Passport.create(query),
                    user.email ? User.createCheckEmailToken(user, user.email) : null,
                ];
            })
            .spread((user, passport, token) => {
                // email can be null if social login without email provided
                if (user.email) {
                    EmailTemplateService
                        .sendEmailTemplate('app-subscription-to-confirm', {
                            user: user,
                            token: token
                        })
                        .catch(() => { /* do nothing*/ });
                }

                return downloadProfileImage(user, query, profile);
            })
            .then(user => {
                return StelaceEventService.createEvent({
                    req: req,
                    label: 'user.created',
                    type: 'core',
                    targetUserId: user.id,
                })
                .then(() => user);
            });
    }

    function useExistingPassport(passport, query) {
        return Promise
            .resolve()
            .then(() => {
                // If the tokens have changed since the last session, update them
                if (query.hasOwnProperty("tokens") && query.tokens !== passport.tokens) {
                    return Passport.findByIdAndUpdate(passport.id, { tokens: query.tokens }, { new: true });
                }

                return passport;
            })
            .then(passport => {
                // Fetch the user associated with the Passport
                return User.findById(passport.user);
            });
    }

    function connectNewPassport(query, req) {
        query.userId = req.user.id;

        return Passport
            .create(query)
            .then(() =>  req.user);
    }

    function downloadProfileImage(user, query, profile) {
        var imageSize = 300;
        var imageUrl;

        if (profile.photos.length) {
            if (query.provider === "facebook") {
                // get the image this way in order to have a bigger image
                imageUrl = "https://graph.facebook.com/"
                                + query.identifier
                                + "/picture?width=" + imageSize
                                + "&height=" + imageSize
                                + "&access_token=" + query.tokens.accessToken;
            } else if (query.provider === "google") {
                // do not take the default image
                if (profile._json.image && ! profile._json.image.isDefault) {
                    imageUrl = profile.photos[0].value;

                    var sizeRegex = /^(.*[?&]sz=)(\d+)(.*)$/;
                    if (sizeRegex.test(imageUrl)) {
                        imageUrl = imageUrl.replace(sizeRegex, '$1' + imageSize + '$3');
                    }
                }
            }
        }

        if (imageUrl) {
            var fileUuid = uuid.v4();
            var filepath;
            var extension;

            return getFileExtension(imageUrl)
                .then(ext => {
                    extension = ext;
                    filepath  = path.join(sails.config.tmpDir, fileUuid + "." + extension);

                    return downloadImage(imageUrl, filepath);
                })
                .then(() => {
                    return new Promise((resolve, reject) => {
                        gm(filepath).size((err, size) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(size);
                            }
                        });
                    });
                })
                .then(fileSize => {
                    var createAttrs = {
                        name: "Profile_image_from_" + query.provider,
                        extension: extension,
                        uuid: fileUuid,
                        type: "img",
                        userId: user.id,
                        field: "user",
                        targetId: user.id,
                        width: fileSize.width,
                        height: fileSize.height
                    };

                    return Media.create(createAttrs);
                })
                .then(media => {
                    // do not compress image compared to upload file function
                    // because pictures from social networks is compressed
                    var destFilePath = path.join(sails.config.uploadDir, Media.getStorageFilename(media));

                    return [
                        media,
                        fs.renameAsync(filepath, destFilePath)
                    ];
                })
                .spread(media => {
                    return User.findByIdAndUpdate(user.id, { mediaId: media.id }, { new: true });
                })
                .catch(() => {
                    return fs.unlinkAsync(filepath)
                        .then(() => user)
                        .catch(() => user);
                });
        } else {
            return user;
        }
    }

    function getFileExtension(url) {
        return request.headAsync(url)
            .spread(response => {
                if (! response.headers || ! response.headers["content-type"]) {
                    return;
                }

                return Media.convertContentTypeToExtension(response.headers["content-type"]);
            });
    }

    function downloadImage(url, filepath) {
        return new Promise((resolve, reject) => {
            request(url)
                .pipe(fs.createWriteStream(filepath))
                .on("error", reject)
                .on("close", resolve);
        });
    }
};

/**
 * Create an authentication endpoint
 *
 * For more information on authentication in Passport.js, check out:
 * http://passportjs.org/guide/authenticate/
 *
 * @param  {Object} req
 * @param  {Object} res
 */
passport.endpoint = function (req, res) {
    var strategies = sails.config.passport;
    var provider   = req.param('provider');
    var options    = {
        session: false
    };

    // If a provider doesn't exist for this endpoint, send the user back to the
    // login page
    if (! strategies.hasOwnProperty(provider)) {
        return res.redirect('/login');
    }

    // Attach scope if it has been set in the config
    if (strategies[provider].hasOwnProperty("scope")) {
        options.scope = strategies[provider].scope;
    }

    // Redirect the user to the provider for authentication. When complete,
    // the provider will redirect the user back to the application at
    //     /auth/:provider/callback
    this.authenticate(provider, options)(req, res, req.next);
};

/**
 * Create an authentication callback endpoint
 *
 * For more information on authentication in Passport.js, check out:
 * http://passportjs.org/guide/authenticate/
 *
 * @param {Object}   req
 * @param {Object}   res
 * @param {Function} next
 */
passport.callback = function (req, res, next) {
    var provider = req.param('provider') || "local";
    var action   = req.param('action');

    // Passport.js wasn't really built for local user registration, but it's nice
    // having it tied into everything else.
    if (provider === "local" && typeof action !== "undefined") {
        if (action === "register" && ! req.user) {
            this.protocols.local.register(req, res, next);
        } else if (action === "connect" && req.user) {
            this.protocols.local.connect(req, res, next);
        } else {
            // cannot register twice or perform actions different from (register, connect)
            next(new BadRequestError("invalid action"));
        }
    } else {

        // The provider will redirect the user to this URL after approval. Finish
        // the authentication process by attempting to obtain an access token. If
        // access was granted, the user will be logged in. Otherwise, authentication
        // has failed.

        if (provider === "local" && (! req.param("identifier") || ! req.param("password"))) {
            return next(new BadRequestError("invalid action"));
        }

        this.authenticate(provider, next)(req, res, req.next);
    }
};

/**
 * Load all strategies defined in the Passport configuration
 *
 * For example, we could add this to our config to use the GitHub strategy
 * with permission to access a users email address (even if it's marked as
 * private) as well as permission to add and update a user's Gists:
 *
    github: {
      name: 'GitHub',
      protocol: 'oauth2',
      scope: [ 'user', 'gist' ]
      options: {
        clientID: 'CLIENT_ID',
        clientSecret: 'CLIENT_SECRET'
      }
    }
 *
 * For more information on the providers supported by Passport.js, check out:
 * http://passportjs.org/guide/providers/
 *
 */
passport.loadStrategies = function () {
    var self       = this;
    var strategies = sails.config.passport;

    _.forEach(_.keys(strategies), function (key) {
        var options = { passReqToCallback: true };
        var Strategy;

        if (key === 'local') {
            // Since we need to allow users to login using both usernames as well as
            // emails, we'll set the username field to something more generic.
            _.extend(options, { usernameField: 'identifier' });

            // Only load the local strategy if it's enabled in the config
            if (strategies.local) {
                Strategy = strategies[key].strategy;

                self.use(new Strategy(options, self.protocols.local.login));
            }
        } else {
            if (!strategies[key]) return;

            var protocol = strategies[key].protocol;
            var callback = strategies[key].callback;

            if (! callback) {
                callback = path.join('auth', key, 'callback');
            }

            Strategy = strategies[key].strategy;

            var baseUrl = sails.getBaseurl();

            switch (protocol) {
                case "oauth":
                case "oauth2":
                    options.callbackURL = url.resolve(baseUrl, callback);
                    break;

                case "openid":
                    options.returnURL = url.resolve(baseUrl, callback);
                    options.realm     = baseUrl;
                    options.profile   = true;
                    break;
            }

            // Merge the default options with any options defined in the config. All
            // defaults can be overriden, but I don't see a reason why you'd want to
            // do that.
            _.extend(options, strategies[key].options);

            self.use(new Strategy(options, self.protocols[protocol]));
        }
    });
};

passport.serializeUser(function (user, next) {
    next(null, user.id);
});

passport.deserializeUser(function (id, next) {
    User.findOne(id, next);
});

module.exports = passport;
