(function () {

    angular
        .module("app.core")
        .factory("ContentService", ContentService);

    function ContentService($ngRedux, $q, $translate, loggerToServer, toastr) {
        var heroBgHomeStyle;

        var service = {};
        service.refreshTranslation = refreshTranslation;
        service.setHeroBackground = setHeroBackground;
        service.setLogo = setLogo;
        service.showNotification = showNotification;
        service.showError = showError;
        service.showSaved = showSaved;

        return service;



        function refreshTranslation() {
            $translate.refresh();
        }

        function setHeroBackground(url) {
            if (!heroBgHomeStyle) {
                heroBgHomeStyle = document.createElement('style');
                heroBgHomeStyle.id = _.uniqueId('style_');
                document.body.appendChild(heroBgHomeStyle);
            }

            heroBgHomeStyle.innerHTML = [
                '.stelace-hero__background, .authentication .app-container::before {',
                'color: red',
                    // 'background-image: url("' + url + '")',
                '}'
            ].join('');
        }

        function setLogo(url) {
            var state = $ngRedux.getState();
            var config = state.config;
            config.logo__url = url;
            config = _.assign({}, config);

            $ngRedux.dispatch(window.actions.ConfigActions.setConfig(config));
        }

        /**
         * Provide translations keys to show notification message
         * @param {String} [titleKey]
         * @param {String} messageKey
         * @param {Object} [titleValues]
         * @param {Object} [messageValues]
         * @param {String} [type = 'info'] - possible values: 'success', 'info', 'warning', 'error'
         */
        function showNotification(args) {
            var titleKey = args.titleKey;
            var messageKey = args.messageKey;
            var titleValues = args.titleValues;
            var messageValues = args.messageValues;
            var type = args.type || 'info';
            var options = args.options;

            if (typeof messageKey !== 'string') {
                throw new Error('Message key required');
            }
            if (titleKey && typeof titleKey !== 'string') {
                throw new Error('Title key must be a string');
            }

            return $q.all({
                title: titleKey ? $translate(titleKey, titleValues) : null,
                message: $translate(messageKey, messageValues),
            }).then(function (results) {
                if (results.title) {
                    toastr[type](results.message, results.title, options);
                } else {
                    toastr[type](results.message, options);
                }
            })
            .catch(function (missingKey) {
                throw new Error('Missing notification translation key: ' + missingKey);
            });
        }

        function showError(err, options) {
            if (err) {
                loggerToServer.error(err);
            }

            return showNotification({
                titleKey: 'error.unknown_happened_title',
                messageKey: 'error.unknown_happened_message',
                type: 'warning',
                options: options
            });
        }

        function showSaved(options) {
            return showNotification({
                messageKey: 'notification.saved',
                type: 'success',
                options: options
            });
        }
    }

})();
