/* global EmailTemplateService, LoggerService, SmsTemplateService, ToolsService */

const mongoose = require('mongoose');
const moment = require('moment');

const { extendSchema } = require('./util');
const Booking = require('./Booking');
const Conversation = require('./Conversation');
const Listing = require('./Listing');
const User = require('./User');

const MessageSchema = mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    privateContent: {
        type: String,
        maxLength: 2000,
    },
    publicContent: {
        type: String,
        maxLength: 2000,
    },
    read: { // populated for future use, per message. For the moment read status of whole conversation is used for simplicity
        type: Boolean,
        default: false,
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    bookingStatus: String,
    agreementStatus: String,
    answerDelay: Number, // seconds. User stat also in Conversation (unique per conversation for the moment)
});

extendSchema(MessageSchema);

MessageSchema.statics.getAccessFields = function (access) {
    var accessFields = {
        self: [
            "conversationId",
            "senderId",
            "receiverId",
            "privateContent",
            "publicContent",
            "read",
            "bookingId",
            "bookingStatus",
            "agreementStatus",
            "createdDate",
            "updatedDate"
        ],
        others: [
            "conversationId",
            "senderId",
            "receiverId",
            "publicContent",
            "createdDate"
        ]
    };

    return accessFields[access];
};

/**
 * @param {integer} userId
 * @param {object}  createAttrs
 * @param {integer} createAttrs.listingId
 * @param {integer} createAttrs.conversationId
 * @param {integer} createAttrs.senderId
 * @param {integer} createAttrs.receiverId
 * @param {string}  [createAttrs.privateContent]
 * @param {string}  [createAttrs.publicContent]
 * @param {integer} [createAttrs.bookingId]
 * @param {string}  [createAttrs.bookingStatus]
 * @param {string}  [createAttrs.agreementStatus]
 * @param {object}  params
 * @param {object}  [params.logger]                         - Source request logger
 * @param {boolean} [params.skipEmailAndSms = false]
 * @param {boolean} [params.forceNewConversation = false]
 * @param {boolean} [params.allowEmptyConversation = false] - Allow conversation creation with no message (for automatic actions)
 * @param {boolean} [params.allowEmpty = false]             - Allow empty conversation AND empty message creation
 * @param {object}  [params.emptyConversationMeta]          - Allow to set conversation's private/public content despite empty message
 * @param {object}  [params.noObfuscate = false]            - Allow to stop obfuscating messages
 *
 * @returns {object} Message created OR empty conversationId singleton if no message were created using one allowEmpty parameter
 */
MessageSchema.statics.createMessage = async function (userId, createAttrs, params) {
    var pickUpdateConversationAttrs = [
        "startDate",
        "endDate",
        "bookingId",
        "bookingStatus",
        "agreementStatus",
        "privateContent",
        "answerDelay",
        "newContentDate"
    ];
    var logger = params.logger || LoggerService.getLogger("app");

    var error;

    var results = await Promise.props({
        listing: Listing.findById(createAttrs.listingId),
        conversation: findExistingConversation(createAttrs),
        messages: createAttrs.conversationId ? this.find({ conversationId: createAttrs.conversationId }) : [] // for duplicate detection (avoid email spam)
    });

    var listing         = results.listing;
    var conversation = results.conversation;
    var messages     = results.messages;

    if (! listing) {
        throw new NotFoundError();
    }

    var booking;

    // can be undefined when current message is first one for this booking
    // In this case, we must try to find a relevant conversation or create one
    if (conversation && conversation.bookingId) {
        booking = await Booking.findById(conversation.bookingId);

        if (! booking) {
            error = new NotFoundError("Missing conversation booking");
            error.conversationId = conversation.id;
            error.bookingId      = conversation.bookingId;
            throw error;
        }
    }

    var newBooking;
    if (createAttrs.bookingId) {
        newBooking = await Booking.findById(createAttrs.bookingId);

        if (! newBooking) {
            throw new NotFoundError();
        }
    }

    // empty messages are only allowed if a first real message has been sent before (possibly in previous conversations)
    // should not happen since message content is required client-side when no previous conversation
    // WARNING: there can be empty conversations (e.g. automatically created new ones for bookings w/ repeated users and listingId)
    if (! (params.allowEmpty || params.allowEmptyConversation)
        && ! conversation
        && ! createAttrs.privateContent
        && ! createAttrs.publicContent
    ) {
        error = new BadRequestError("user must write a real message to create conversation");
        error.expose = true;
        throw error;
    }

    // obfuscate all messages if the booking isn't paid and accepted
    // and if no obfuscate parameter is passed
    var paidAndAcceptedBooking = booking && booking.paidDate;

    if (! params.noObfuscate
        && ! paidAndAcceptedBooking
    ) {
        createAttrs.privateContent = ToolsService.obfuscateContactDetails(createAttrs.privateContent);
        createAttrs.publicContent  = ToolsService.obfuscateContactDetails(createAttrs.publicContent);
    }

    var newMessageData;

    // create new conversation for new (pre-)booking if preexisting paid booking that has not been cancelled (if pending > new conversation)
    // to avoid 2 effective bookings in same conversation. Note: Only (pre-)bookings have a bookingId
    var existingPaidBooking = booking && booking.paidDate && ! booking.cancellationId ? booking : null;
    var newBookingDifferentThanExisting = newBooking && existingPaidBooking && !µ.isSameId(existingPaidBooking.id, newBooking.id);

    if (params.forceNewConversation
        || ! conversation
        || newBookingDifferentThanExisting
    ) {
        newMessageData = await this._createMessageWithNewConversation({
            createAttrs: createAttrs,
            pickUpdateConversationAttrs: pickUpdateConversationAttrs,
            params: params
        });
    } else {
        if (! Conversation.isPartOfConversation(conversation, userId)) {
            throw new BadRequestError();
        }

        newMessageData = await this._createMessageWithExistingConversation({
            conversation: conversation,
            createAttrs: createAttrs,
            pickUpdateConversationAttrs: pickUpdateConversationAttrs,
            params: params,
            userId: userId
        });
    }

    var data = {
        conversation: newMessageData.conversation,
        message: newMessageData.message,
        messages: messages,
        listing: listing,
        firstMessage: newMessageData.isFirstMessage
    };

    // emails and sms are not critical, errors not promise-blocking
    if (! params.skipEmailAndSms) {
        _sendNewMessageEmailsAndSms(data, logger);
    }

    return newMessageData.message;
};

/**
 * find existing conversation based on new message metadata
 * @param  {object} createAttrs
 * @return {Promise<object>} existing conversation
 */
async function findExistingConversation(createAttrs) {
    if (createAttrs.conversationId) {
        return await Conversation.findById(createAttrs.conversationId);
    }

    // find relevant conversations
    // Only one conversation for given listingId and senderId-receiverId pair AND paid bookingId
    // Take last conversation by default (most recent booking if several booking between 2 users and createAttrs.bookingId)
    var usersIds = [createAttrs.senderId, createAttrs.receiverId];

    var conversations = await Conversation
        .find({
            listingId: createAttrs.listingId,
            senderId: usersIds,
            receiverId: usersIds
        })
        .sort({ createdDate: -1 });

    // sort conversations by putting those who match booking first
    var sortedConversations = _.sortBy(conversations, conv => {
        if (! createAttrs.bookingId) {
            return 1;
        }
        return µ.isSameId(conv.bookingId, createAttrs.bookingId) ? -1 : 1;
    });

    var rightConversation = _.find(sortedConversations, conv => {
        var isBookingAgreement = createAttrs.bookingId
            && (createAttrs.agreementStatus === "agreed" || createAttrs.agreementStatus === "rejected");

        // reuse conversations whose booking agreement is set by owner
        // or info conversations
        // or pre-booking conversations
        // or conversations whose existing booking isn't agreed
        return ((isBookingAgreement && (createAttrs.bookingId === conv.bookingId))
            || conv.bookingStatus === "info"
            || conv.bookingStatus === "pre-booking"
            || (conv.bookingStatus === "booking" && conv.agreementStatus !== "agreed")
        );
    });

    return rightConversation;
}

/**
 * create message with new conversation
 * @param  {object} args
 * @param  {object} args.createAttrs
 * @param  {object} args.pickUpdateConversationAttrs
 * @param  {object} args.params
 * @return {Promise<object>} newMessageData
 * @return {object}          newMessageData.message
 * @return {boolean}         newMessageData.isFirstMessage
 */
MessageSchema.statics._createMessageWithNewConversation = async function (args) {
    var createAttrs                 = args.createAttrs;
    var pickUpdateConversationAttrs = args.pickUpdateConversationAttrs;
    var params                      = args.params;

    var createConvAttrs        = _.pick(createAttrs, pickUpdateConversationAttrs);
    createConvAttrs.listingId     = createAttrs.listingId;
    createConvAttrs.senderId   = createAttrs.senderId;
    createConvAttrs.receiverId = createAttrs.receiverId;

    // Populate conversation's privateContent with message's publicContent to avoid conversation emptyness (See Conversation.js)
    if (! createConvAttrs.privateContent && createAttrs.publicContent) {
        createConvAttrs.privateContent = createAttrs.publicContent;
    }

    // Populate conversation with pending message content (payment emails)
    if (params.allowEmptyConversation || params.allowEmpty) {
        _.defaults(createConvAttrs, params.emptyConversationMeta);
    }

    if (createAttrs.startDate && createAttrs.endDate && ! createConvAttrs.agreementStatus) {
        createConvAttrs.agreementStatus = "pending";
    }

    var conversation = await Conversation.create(createConvAttrs);

    var shouldCreateMessage = createAttrs.privateContent || createAttrs.publicContent || params.allowEmpty;
    createAttrs.conversationId = conversation.id;

    var message;
    if (shouldCreateMessage) {
        message = await this.create(createAttrs);
    } else {
        message = { conversationId: conversation.id };
    }

    return {
        conversation: conversation,
        message: message,
        isFirstMessage: true
    };
};

/**
 * create message with existing conversation
 * @param  {object} args
 * @param  {object} args.conversation
 * @param  {object} args.createAttrs
 * @param  {object} args.pickUpdateConversationAttrs
 * @param  {object} args.params
 * @param  {ObjectId} args.userId
 * @return {Promise<object>} newMessageData
 * @return {object}          newMessageData.message
 * @return {boolean}         newMessageData.isFirstMessage
 */
MessageSchema.statics._createMessageWithExistingConversation = async function (args) {
    var conversation                = args.conversation;
    var createAttrs                 = args.createAttrs;
    var pickUpdateConversationAttrs = args.pickUpdateConversationAttrs;
    var params                      = args.params;
    var userId                      = args.userId;

    // fetch messages again because the conversation isn't necessarily the same as the beginning
    var messages = await this
        .find({ conversationId: conversation.id })
        .sort({ createdDate: 1 });

    var isFirstMessage = ! messages.length;

    if (µ.isSameId(conversation.senderId, createAttrs.senderId) && createAttrs.publicContent) {
        // concatenate public and private parts for all taker messages except first one
        // should not happen if managed correctly client-side (public input hidden)
        if (! createAttrs.privateContent) {
            createAttrs.privateContent = createAttrs.publicContent;
        } else {
            createAttrs.privateContent += "\n" + createAttrs.publicContent;
        }
        createAttrs.publicContent = null;
    } else if (µ.isSameId(conversation.senderId, createAttrs.receiverId)
        && messages.length
        && ! _.find(messages, { senderId: conversation.receiverId })
    ) {
        // compute answerDelay only if current message is owner's first answer
        // take updatedDate since message draft can be created when failing payment > overestimated answerDelay
        createAttrs.answerDelay = moment().diff(messages[0].updatedDate, "s");
    }

    if (µ.isSameId(conversation.senderId, createAttrs.senderId)
        && createAttrs.startDate
        && createAttrs.endDate
        && conversation.startDate
        && conversation.endDate
        && (createAttrs.startDate !== conversation.startDate.toISOString() || createAttrs.endDate !== conversation.endDate.toISOString())
    ) {
        // booking must be (pre-)accepted again
        createAttrs.agreementStatus = "pending";
    }

    var updateAttrs = _.pick(createAttrs, pickUpdateConversationAttrs);

    if (µ.isSameId(userId, conversation.senderId)) {
        updateAttrs.receiverRead = false;
    } else {
        updateAttrs.senderRead = false;
    }

    // Update conversation with pending message content (payment emails)
    // allowEmptyConversation and emptyConversationMeta are only used during payment
    if (params.allowEmptyConversation || params.allowEmpty) {
        _.assign(updateAttrs, params.emptyConversationMeta);
    }

    conversation = await Conversation.findByIdAndUpdate(conversation.id, updateAttrs, { new: true });

    var shouldCreateMessage = createAttrs.privateContent || createAttrs.publicContent || params.allowEmpty;
    createAttrs.conversationId = conversation.id;

    var message;
    if (shouldCreateMessage) {
        message = await this.create(createAttrs);
    } else {
        message = { conversationId: conversation.id };
    }

    return {
        conversation: conversation,
        message: message,
        isFirstMessage: isFirstMessage
    };
};

// WARNING : these emails and sms are not critical, catch the error
function _sendNewMessageEmailsAndSms(data, logger) {
    var conversation     = data.conversation;
    var message          = data.message;
    var messages         = data.messages;
    var listing             = data.listing;
    var firstMessage     = data.firstMessage;
    var receiverIsOwner  = µ.isSameId(listing.ownerId, message.receiverId);
    var isBookingMessage = _skipNewMessageSms(message);
    var error;

    if (_skipNewMessageNotification(conversation, message)) {
        return;
    }

    return Promise
        .resolve()
        .then(() => {
            return [
                User.findById(message.senderId),
                User.findById(message.receiverId),
                message.bookingId ? Booking.findById(message.bookingId) : null
            ];
        })
        .spread((sender, receiver, booking) => {
            if (! sender || ! receiver) {
                error = new Error("Can't populate message's sender and receiver");
                error.messageId = message.id;
                throw error;
            }

            return [
                sender,
                receiver,
                booking,
                Listing.getMedias([listing]).then(listingMedias => listingMedias[listing.id]),
                User.getMedia([sender]).then(senderMedia => senderMedia[sender.id])
            ];
        })
        .spread((sender, receiver, booking, listingMedias, senderMedia) => {
            var isDuplicate  = _.find(messages, function (msg) {
                // do not send email for duplicates in same day, but confirmation SMS should be sent anyway
                var sameDay    = moment(message.createdDate).isSame(msg.createdDate, "day");
                var sameContent = (("" + message.privateContent + message.publicContent) === ("" + msg.privateContent + msg.publicContent));
                return (sameDay && sameContent);
            });

            if (! isDuplicate) {
                EmailTemplateService
                    .sendEmailTemplate('new-message', {
                        user: receiver,
                        listing: listing,
                        listingMedias: listingMedias,
                        conversation: conversation,
                        firstMessage: firstMessage,
                        message: message,
                        sender: sender,
                        senderMedia: senderMedia,
                        booking: booking // to check if booking has already been accepted
                    })
                    .catch(err => {
                        logger.error({ err: err }, "send new message email");
                    });
            }

            if (isBookingMessage) {
                return;
            }

            // Send SMS to owner when pre-booking or firstMessage, and to giver when firstMessage
            // SMS is already sent after booking payment or acceptation in Booking Controller
            if (message.bookingStatus === "pre-booking" || (firstMessage && receiverIsOwner)) {
                SmsTemplateService
                    .sendSmsTemplate('new-message', {
                        user: receiver,
                        booking,
                    })
                    .catch(err => {
                        logger.error({ err: err }, "send sms new message to owner");
                    });
            }
        })
        .catch(err => {
            logger.error({ err: err }, "send new message email");
        });
}

/**
 * Do not send sms when some are already sent in Booking Controller
 * @param {object}     message
 *
 * @returns {boolean}
 */
function _skipNewMessageSms(message) {
    return (message.bookingStatus === "booking" || message.agreementStatus === "agreed");
}

/**
 * Skip new-message notification to receiver, according to configuration in excludedNotificationStatus
 * When receiver as already received a booking call-to-action email (such as bookingPendingOwner)
 * @param {object}     conversation
 * @param {object}     message
 *
 * @returns {boolean}  skipMessageNotification
 */
function _skipNewMessageNotification(conversation, message) {
    var skipMessageNotification    = false;
    var excludedNotificationStatus = [{
        // Templates: bookingPendingOwner, bookingPendingGiver*
        "message.bookingStatus": "booking"
    }, /* OR */ {
        // Templates: prebookingPendingTaker (but not bookingConfirmedTaker)
        "conversation.bookingStatus": "pre-booking", // AND
        "message.agreementStatus": "agreed"
    }];
    // TODO: add { message.agreementStatus: "reject" } when sending cancellation email template

    // These statuses imply booking emails with message content have already been sent
    skipMessageNotification = _.reduce(excludedNotificationStatus, (skip, statusObject) => {
        var checkAgainst        = {
            "conversation.bookingStatus": conversation.bookingStatus,
            "conversation.agreementStatus": conversation.agreementStatus,
            "message.bookingStatus": message.bookingStatus,
            "message.agreementStatus": message.agreementStatus
        };

        return (skip || _.isEqual(_.pick(checkAgainst, _.keys(statusObject)), statusObject));
    }, false);

    return skipMessageNotification;
}

MessageSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;

        return ret;
    },
});

module.exports = mongoose.model('Message', MessageSchema);
