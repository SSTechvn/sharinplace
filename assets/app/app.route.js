(function () {

    angular
        .module("app")
        .config(configBlock)
        .run(runBlock);

    function configBlock($urlRouterProvider, platformProvider) {
        // if unmatched route, then display 404 view
        $urlRouterProvider.otherwise(function ($injector) {
            var $state = $injector.get("$state");
            var $location = $injector.get("$location");

            var url = $location.url();
            var isProd = platformProvider.getEnvironment() === "prod";

            var blogRegex = /^\/blog([?/].*)?$/gi;
            var dashboardRegex = /^\/dashboard([?/].*)?$/gi;
            var stelaceRegex = /^\/stelace([?/].*)?$/gi;

            var isBlogUrl = blogRegex.test(url);
            var isDashboardUrl = dashboardRegex.test(url) || stelaceRegex.test(url);

            var exitAngular = (isBlogUrl && isProd) || isDashboardUrl;
            // don’t go to external blog url in dev, but allow dashboard debugging

            if (exitAngular) {
                    window.location.href = url;
            } else {
                goTo404();
            }

            function goTo404() {
                $state.go("404", null, { location: false });
            }
        });
    }

    function runBlock($rootScope,
                        $log,
                        $state,
                        $location,
                        $urlMatcherFactory,
                        $window,
                        authentication,
                        gamification,
                        platform,
                        StelaceEvent) {
        var log = $log.getInstance("app.route runBlock");

        var eventId    = document.body.getAttribute("data-event-id");
        var eventToken = document.body.getAttribute("data-event-token");

        if (eventId && eventToken) {
            StelaceEvent.updateEvent(eventId, eventToken, {
                srcUrl: $location.absUrl(),
                width: window.innerWidth,
                height: window.innerHeight
            });
        }

        $rootScope.$on("$stateChangeStart", function (event, toState, toParams, fromState, fromParams) {
            log.debug("$stateChangeStart :", {
                event: event,
                toState: toState,
                toParams: toParams,
                fromState: fromState,
                fromParams: fromParams
            });

            $rootScope.searchFiltersConfig.showAdvancedSearch = false;

            authentication.isAuthenticated()
                .then(function (isAuthenticated) {
                    if (isAuthenticated && toState.name === "login") {
                        $state.go("account");
                    } else if (! isAuthenticated && (toState.name === "myListings" || toState.name === "editListing")) {
                        $state.go("listingCreate");
                    } else if (! isAuthenticated && ! toState.noAuthNeeded) {
                        var originalURL = $urlMatcherFactory.compile(toState.url).format(toParams);
                        var redirectToRegisterView = (/[?&]register=true/).test(originalURL);
                        var redirectURL = originalURL;
                        var encodedRedirectURL  = encodeURIComponent(redirectURL);

                        if (redirectToRegisterView) {
                            $state.go("register", { redirect: encodedRedirectURL });
                        } else {
                            $state.go("login", { redirect: encodedRedirectURL });
                        }
                    }
                });
        });

        $rootScope.$on("$stateChangeSuccess", function (event, toState, toParams, fromState/*, fromParams */) {
            var app = document.getElementsByTagName("body")[0];
            var fromAppClassName = fromState.appClassName;
            var toAppClassName   = toState.appClassName;
            var title;

            if (fromAppClassName !== toAppClassName) {
                if (toAppClassName) {
                    app.classList.add(toAppClassName);
                }
                if (fromAppClassName) {
                    app.classList.remove(fromAppClassName);
                }
            }

            if (toState.title) {
                if (typeof toState.title === "function") {
                    title = toState.title(toState, toParams);
                } else {
                    title = toState.title;
                }

                if (typeof title !== "string") {
                    throw "Missing title";
                }
            }

            platform.unsetCanonicalLink();

            // Useless once the app has been set to ready (snapshot done)
            if (toState.metaTags && document.body.getAttribute("data-status") !== "ready") {
                platform.unsetMetaTags();
                platform.setMetaTags(toState.metaTags);
            }

            // reset OpenGraph tags
            platform.setOpenGraph();
            platform.setTwitterCard();

            // WARNING: Asynchronous translation
            platform.setTitle(title || '') // TODO: set a default title to platform name
                .finally(function () {
                    // Google analaytics page view
                    // Removed from server's app.ejs template to avoid duplicates
                    if (typeof $window.ga === "function") {
                        $window.ga('send', 'pageview', { page: $location.path() });
                    }
                    if (typeof $window.fbq === "function") {
                        $window.fbq('track', 'PageView');
                    }
                });
        });

        $rootScope.$on("$viewContentLoaded", function (/* event, viewConfig */) {
            $window.scrollTo(0, 0);
        });

    }

})();
