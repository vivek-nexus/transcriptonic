/**
 * @typedef {Object} TranscriptBlock A chunk of transcript
 * @property {string} personName name of the person who spoke
 * @property {string} timestamp ISO timestamp of when the words were spoken
 * @property {string} transcriptText actual transcript text
 */

/**
 * @typedef {Object} ChatMessage A chat message
 * @property {string} personName name of the person who sent the message
 * @property {string} timestamp ISO timestamp of when the message was sent
 * @property {string} chatMessageText actual message text
 */

/**
 * @typedef {Object} WebhookBody
 * @property {"simple" | "advanced"} webhookBodyType simple or advanced
 * @property {string} meetingTitle title of the meeting
 * @property {string} meetingStartTimestamp ISO timestamp of when the meeting started
 * @property {string} meetingEndTimestamp ISO timestamp of when the meeting ended
 * @property {TranscriptBlock[] | string} transcript transcript as a formatted string or array containing transcript blocks from the meeting
 * @property {ChatMessage[] | string} chatMessages chat messages as a formatted string or array containing chat messages from the meeting
 */



// LOCAL CHROME STORAGE VARIABLES
/**
 * @typedef {Object} ResultLocal Local chrome storage
 * @property {ExtensionStatusJSON} extensionStatusJSON
 * @property {MeetingTabId} meetingTabId
 * @property {MeetingTitle} meetingTitle
 * @property {MeetingStartTimestamp} meetingStartTimestamp
 * @property {Transcript} transcript
 * @property {ChatMessages} chatMessages
 * @property {IsDeferredUpdatedAvailable | undefined} isDeferredUpdatedAvailable
 * @property {Meeting[] | undefined} meetings
 */

/**
 * @typedef {Object} ExtensionStatusJSON
 * @property {number} status status of the extension
 * @property {string} message message of the status
*/
/**
 * @typedef {Object} Meeting
 * @property {string | undefined} [meetingTitle] title of the meeting
 * @property {string | undefined} [title] title of the meeting (this is older key for meetingTitle key, in v3.1.0)
 * @property {string} meetingStartTimestamp ISO timestamp of when the meeting started
 * @property {string} meetingEndTimestamp ISO timestamp of when the meeting ended
 * @property {TranscriptBlock[] | []} transcript array containing transcript blocks from the meeting
 * @property {ChatMessage[] | []} chatMessages array containing chat messages from the meeting
 * @property {"new" | "failed" | "successful"} webhookPostStatus status of the webhook post request
 */
/**
 * @typedef {number | "processing" | null} MeetingTabId tab id of the meeting tab, captured when meeting starts. A valid value or "processing" indicates that a meeting is in progress. Set to null once meeting ends and associated processing is complete.
 */
/**
 * @typedef {string} MeetingStartTimestamp ISO timestamp of when the most recent meeting started, dumped by content script
 */
/**
 * @typedef {string} MeetingTitle title of the most recent meeting, dumped by content script
 */
/**
 * @typedef {TranscriptBlock[]} Transcript Transcript of the most recent meeting, dumped by content script
 */
/**
 * @typedef {ChatMessage[]} ChatMessages Chat messages captured during the most recent meeting, dumped by content script
 */
/**
 * @typedef {boolean} IsDeferredUpdatedAvailable whether the extension has a deferred updated waiting to be applied
 */




// SYNC CHROME STORAGE VARIABLES
/**
 * @typedef {Object} ResultSync Sync chrome storage
 * @property {AutoPostWebhookAfterMeeting} autoPostWebhookAfterMeeting
 * @property {OperationMode} operationMode
 * @property {WebhookBodyType} webhookBodyType
 * @property {WebhookUrl} webhookUrl
 */

/**
 * @typedef {boolean} AutoPostWebhookAfterMeeting Whether to automatically post the webhook after each meeting
 */
/**
 * @typedef {"auto" | "manual"} OperationMode mode of the extension which decides whether to automatically capture transcripts or let the user decide per meeting basis
 */
/**
 * @typedef {"simple" | "advanced"} WebhookBodyType type of webhook body to use
 */
/**
 * @typedef {string} WebhookUrl URL of the webhook
 */



/** 
 * @typedef {Object} ExtensionMessage Message sent by the calling script
 * @property {"new_meeting_started" | "meeting_ended" | "download_transcript_at_index" | "retry_webhook_at_index" | "recover_last_meeting"} type type of message
 * @property {number} [index] index of the meeting to process
 */

/** 
 * @typedef {Object} ExtensionResponse Response sent by the called script
 * @property {boolean} success whether the message was processed successfully as per the request
 * @property {string} [message] message explaining success or failure
 */