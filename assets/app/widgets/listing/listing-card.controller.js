(function () {

    angular
        .module("app.widgets")
        .controller("ListingCardController", ListingCardController);

    function ListingCardController($scope,
                                $state,
                                LocationService) {

        var displayDuration = ($scope.displayDuration === "true");

        var vm              = this;
        vm.listing          = $scope.listing;
        vm.position         = $scope.position;

        activate();

        function activate() {

            // See http://stackoverflow.com/questions/20068526/angularjs-directive-does-not-update-on-scope-variable-changes
            $scope.$watch('listing', function (newListing) {
                vm.listing = newListing;
                _displayLocation();
                // _displayOwnerImage();
            });

        }

        function _displayLocation() {
            if (displayDuration) {
                // durationString is defined in view controller
                // Only show if fromLocation and toLocation are not in the same city
                if (vm.listing.loc && vm.listing.toLoc
                    && (vm.listing.loc.city === vm.listing.toLoc.city)
                ) {
                    vm.durationString = null;
                } else {
                    vm.durationString = vm.listing.minDurationString;
                }

                // Locname is default for similarListings in listing view and listings in home. Not needed in search since listing.loc is always defined
                if (vm.durationString) {
                    vm.closestLocationShortName = $scope.locname || (vm.listing && vm.listing.loc ? LocationService.getShortName(vm.listing.loc) : "");
                } else {
                    vm.closestLocationShortName = (vm.listing.toLoc && vm.listing.toLoc.city) || (vm.listing.loc && vm.listing.loc.city);
                    // "À..." must be followed by city name when no duration, not by user location
                }
                vm.locationCity   = (vm.listing && vm.listing.toLoc ? vm.listing.toLoc.city : null);
                vm.locationCoords = {
                    latitude: vm.listing.toLoc && vm.listing.toLoc.latitude,
                    longitude: vm.listing.toLoc && vm.listing.toLoc.longitude
                };
            } else if (vm.listing.vLocations && vm.listing.vLocations.length && vm.listing.vLocations[0]) {
                vm.locationCity   = vm.listing.vLocations[0].city || null;
                vm.locationRegion = vm.listing.vLocations[0].region || null;
                // vm.postalCode     = vm.listing.vLocations[0].postalCode || "";
            }
        }

        // function _displayOwnerImage() {
        //     if (! vm.listing.ownerMedia || vm.listing.ownerMedia.url === platform.getDefaultProfileImageUrl()) {
        //         vm.hideOwnerImage = true;
        //     }
        // }

    }

})();
