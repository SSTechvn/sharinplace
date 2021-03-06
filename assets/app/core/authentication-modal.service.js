/* global fbq, ga */

(function () {

    angular
        .module("app.core")
        .factory("authenticationModal", authenticationModal);

    // Modal service that allows to login or register (toggle) with email/social and password

    function authenticationModal($q,
                                    $location,
                                    $rootScope,
                                    $state,
                                    $timeout,
                                    $document,
                                    authentication,
                                    ContentService,
                                    crossTabCommunication,
                                    FoundationApi,
                                    Modal,
                                    platform,
                                    referral,
                                    StelaceEvent,
                                    storage,
                                    tools,
                                    UserService) {

        var service = {};

        service.process = process;

        var doc         = angular.element($document[0].documentElement);
        var isIOS       = tools.isIOS(); // for html scroll
        var scrollClass = "modal-opened" + (isIOS ? " lock-both" : "");
        // modal "controller" functions and properties

        var showSocialLogin = authentication.isSocialLoginAllowed();

        var vm          = {
            showSocialLogin: showSocialLogin,
            login: login,
            register: register,
            sendRecover: sendRecover,
            socialLogin: socialLogin,
            action: action,
            displayLoginError: false
        };
        var modalId = "authenticationModal";
        var modal   = new Modal({
            id: modalId,
            className: "smaller signin-form-container",
            templateUrl: "/assets/app/modals/authenticationModal.html",
            overlayClose: true,
            contentScope: {
                vm: vm
            }
        });
        var clearCache = true;
        var subscribed;
        var deferred;

        activate();

        return service;


        function activate() {
            crossTabCommunication.subscribe("socialLogin", function (newValue) {
                if (newValue === "success" && deferred) {
                    UserService.unsetCurrentUser();
                    $rootScope.$emit("isAuthenticated", true);
                    authentication.setAuthenticated(true);

                    FoundationApi.publish(modalId, "close");
                }
            });
        }

        /**
         * Open authentication modal if needed to login or register
         * @param {string} [formType = "login"] Type of form ("login" or "register")
         * @param {object} [options] - Options related to auth process and additional modals' chaining
         * @param {string} [options.greetingKey] - Custom greeting message translation key in auth modal
         * @param {boolean} [options.preventSubscriptionRedirect = false] - Prevent redirection after registration
         * @returns {object} Promise object
         */
        function process(formType, options) {
            options = options || {};

            return authentication.isAuthenticated(clearCache)
                .then(function (isAuthenticated) {
                    if (isAuthenticated) {
                        $rootScope.$emit("isAuthenticated", true);
                        authentication.setAuthenticated(true);

                        return $q.when(isAuthenticated);
                    } else {
                        // return a new promise before each invocation
                        deferred = $q.defer();
                        return _openModal(formType, options);
                    }
                })
                .catch(function (err) {
                    throw err;
                });
        }

        function _openModal(formType, options) {
            vm.authForm          = formType ? formType.toString() : "login";
            vm.greetingKey       = (platform.isTranslationKeyFormat(options.greetingKey) && options.greetingKey) || "authentication.sign_up_greeting";
            vm.displayLoginError = false;
            vm.autofocus         = true;
            vm.preventRedirect   = options.preventSubscriptionRedirect;

            modal.activate();
            doc.addClass(scrollClass);

            $timeout(function () {
                // Timemout: ensure this event is sent after origin event such as header click
                StelaceEvent.sendEvent("Authentication modal view", {
                    data: {
                        authForm: vm.authForm
                    }
                });
            }, 300);

            // if service already subscribed to modal, useless to subscribe again to resolve promise
            if (! subscribed) {
                FoundationApi.subscribe(modalId, function (msg) {
                    // Before closing, check whether user has been authenticated in another tab
                    if (msg === "close" || msg === "hide") {
                        vm.autofocus = null;
                        doc.removeClass(scrollClass);
                        authentication.isAuthenticated(clearCache)
                            .then(deferred.resolve)
                            .catch(function (err) {
                                deferred.reject(err);
                            })
                            .finally(function () {
                                // must clean things up since modal is not destroyed
                                vm.email = "";
                                vm.password = "";
                            });
                    }
                });
                subscribed = true;
            }
            return deferred.promise;
        }

// "controller" functions

        function action() {
            switch (vm.authForm) {
                case "login":
                    vm.login();
                    break;
                case "register":
                    vm.register();
                    break;
                case "lost":
                    vm.sendRecover(vm.email);
                    break;
                default:
                    vm.login();
            }
        }

        function login() {
            authentication
                .login(vm.email, vm.password)
                .then(function (res) {
                    return authentication.setToken(res.data.access_token);
                })
                .then(function () {
                    authentication.setAuthenticated(true);
                    FoundationApi.publish(modalId, "close");
                    $rootScope.$emit("isAuthenticated", true);
                })
                .catch(function (/* err */) {
                    vm.authForm = "login"; // because the user can come from register form, display the login form if error
                    vm.password = "";
                    _setFormAnimationError();
                    vm.displayLoginError = true;
                });
        }

        function register() {
            authentication
                .register(vm.email, vm.password)
                .then(function (/* res */) {
                    return authentication.login(vm.email, vm.password);
                })
                .then(function (res) {
                    return authentication.setToken(res.data.access_token);
                })
                .then(function () {
                    authentication.setAuthenticated(true);

                    storage.getItem("referralInfo")
                        .then(function (referralInfo) {
                            referralInfo = referralInfo || {};

                            referral.afterRegister(referralInfo.referrerId, referralInfo.date, referralInfo.source)
                                .then(function () {
                                    storage.removeItem("referralInfo");
                                });
                        });

                    // Google Analytics event
                    var url = $location.protocol() + "://" + $location.host() + ($state.current.url || "");
                    ga('send', 'event', 'Accounts', 'Register', 'url: ' + url + "#modal");
                    // Facebook event
                    fbq('track', 'CompleteRegistration');

                    FoundationApi.publish(modalId, "close");
                    $rootScope.$emit("isAuthenticated", true);

                    if (vm.preventRedirect) {
                        // Must opt out redirect for ongoing process such as booking
                        return;
                    }

                    $state.go("account");
                })
                .catch(function (err) {
                    if (err.data && err.data.message === "email exists") {
                        login();
                    } else {
                        _setFormAnimationError();
                    }
                });
        }

        function sendRecover(email) {
            authentication
                .lostPassword(email)
                .then(function () {
                    ContentService.showNotification({
                        messageKey: "authentication.lost_password_email_sent",
                        type: "success"
                    });
                    FoundationApi.publish(modalId, "close");
                });
        }

        function socialLogin(provider) {
            authentication.socialLogin(provider);
        }

        function _setFormAnimationError() {
            vm.formAnimationError = true;

            $timeout(function () {
                vm.formAnimationError = false;
            }, 500);
        }
    }

})();
