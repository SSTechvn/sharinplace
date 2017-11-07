/* global mangopay */

const {
    Card,
} = require('../models_new');

/**
 * CardController
 *
 * @description :: Server-side logic for managing cards
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    create: create,
    destroy: destroy,

    my: my,
    createCardRegistration: createCardRegistration

};

var CryptoJS = require('crypto-js');

function create(req, res) {
    var cardRegistrationId = req.param("cardRegistrationId");
    var registrationData   = req.param("registrationData");
    var forget             = req.param("forget");
    var hash1              = req.param("hash1");
    var hash2              = req.param("hash2");
    var hash3              = req.param("hash3");
    var access = "self";

    if (! cardRegistrationId
     || ! registrationData
     || ! hash1
     || ! hash2
     || ! hash3
    ) {
        return res.badRequest();
    }

    var computedHash = CryptoJS.SHA1(hash1 + hash2).toString();
    if (computedHash !== hash3) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return mangopay.card.editRegistration({
                cardRegistrationId: cardRegistrationId,
                body: {
                    RegistrationData: registrationData
                }
            });
        })
        .then(cardRegistration => {
            var createAttrs = {
                mangopayId: cardRegistration.CardId,
                userId: req.user.id,
                hash1: hash1,
                hash2: hash2
            };

            if (forget) {
                createAttrs.forget = true;
            }

            return Card.create(createAttrs);
        })
        .then(card => {
            return card.synchronize();
        })
        .then(card => {
            res.json(Card.expose(card, access));
        })
        .catch(res.sendError);
}

function destroy(req, res) {
    var id = req.param("id");

    return Promise
        .resolve()
        .then(() => {
            return Card.findOne({
                _id: id,
                userId: req.user.id
            });
        })
        .then(card => {
            if (! card) {
                throw new NotFoundError();
            }

            return Card.findByIdAndUpdate(card.id, { forget: true }, { new: true });
        })
        .then(() => {
            res.json({ id });
        })
        .catch(res.sendError);
}

function my(req, res) {
    var access = "self";

    return Card
        .find({
            userId: req.user.id,
            validity: { $ne: "INVALID" },
            active: true,
            forget: false
        })
        .then(cards => {
            res.json(Card.exposeAll(cards, access));
        })
        .catch(res.sendError);
}

function createCardRegistration(req, res) {
    var cardType = req.param("cardType");

    if (! req.user.mangopayUserId) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return mangopay.card.createRegistration({
                body: {
                    UserId: req.user.mangopayUserId,
                    Currency: "EUR", // TODO: allow other currencies
                    CardType: cardType
                }
            });
        })
        .then(cardRegistration => {
            var obj = {
                id: cardRegistration.Id,
                cardRegistrationURL: cardRegistration.CardRegistrationURL,
                preregistrationData: cardRegistration.PreregistrationData,
                accessKey: cardRegistration.AccessKey,
                cardType: cardRegistration.CardType,
                resultCode: cardRegistration.ResultCode
            };

            return res.json(obj);
        })
        .catch(res.sendError);
}
