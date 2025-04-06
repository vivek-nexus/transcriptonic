/**
 * @typedef {Object} TranscriptBlock
 * @property {string} personName - name of the person speaking
 * @property {string} timestamp - ISO timestamp of when the message was spoken
 * @property {string} transcriptText - actual transcript text
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} personName - name of the person speaking
 * @property {string} timestamp - ISO timestamp of when the message was sent
 * @property {string} chatMessageText - actual message text
 */

/**
 * @typedef {Object} WebhookBody
 * @property {string} meetingTitle
 * @property {string} meetingStartTimestamp
 * @property {string} meetingEndTimestamp
 * @property {TranscriptBlock[] | string} transcript
 * @property {ChatMessage[] | string} chatMessages
 */



// LOCAL CHROME STORAGE VARIABLES
/**
 * @typedef {Object} ResultLocal
 * @property {ExtensionStatusJSON} extensionStatusJSON
 * @property {Meeting[]} meetings
 * @property {MeetingTabId} meetingTabId
 * @property {MeetingStartTimestamp} meetingStartTimestamp
 * @property {MeetingTitle} meetingTitle
 * @property {Transcript} transcript
 * @property {ChatMessages} chatMessages
 * @property {IsDeferredUpdatedAvailable} isDeferredUpdatedAvailable
 */

/**
 * @typedef {Object} ExtensionStatusJSON
 * @property {number} status - status of the extension
 * @property {string} message - message of the extension
*/
/**
 * @typedef {Object} Meeting
 * @property {string | undefined} [meetingTitle] - title of the meeting
 * @property {string | undefined} [title] - title of the meeting (stored as "title" in v3.1.0 data)
 * @property {string} meetingStartTimestamp - ISO timestamp of when the meeting started
 * @property {string} meetingEndTimestamp - ISO timestamp of when the meeting ended
 * @property {TranscriptBlock[]} transcript - array containing transcript blocks from the meeting
 * @property {ChatMessage[]} chatMessages - array containing chat messages from the meeting
 * @property {"new" | "failed" | "successful"} webhookPostStatus - status of the webhook post request
 */
/**
 * @typedef {number | null} MeetingTabId - tab id of the meeting tab, captured when meeting starts. A valid values indicates that a meeting is in progress. Set to null once meeting ends and associated processing is complete.
 */
/**
 * @typedef {string} MeetingStartTimestamp - timestamp of when the most recent meeting started, dumped by content script
 */
/**
 * @typedef {string} MeetingTitle - title of the most recent meeting, dumped by content script
 */
/**
 * @typedef {TranscriptBlock[]} Transcript - Transcript of the most recent meeting, dumped by content script
 */
/**
 * @typedef {ChatMessage[]} ChatMessages - Chat messages captued during the most recent meeting, dumped by content script
 */
/**
 * @typedef {boolean} IsDeferredUpdatedAvailable - Whether the extension is deferred updated
 */




// SYNC CHROME STORAGE VARIABLES
/**
 * @typedef {Object} ResultSync
 * @property {AutoPostWebhookAfterMeeting} autoPostWebhookAfterMeeting
 * @property {OperationMode} operationMode
 * @property {WebhookBodyType} webhookBodyType
 * @property {WebhookUrl} webhookUrl
 */

/**
 * @typedef {boolean} AutoPostWebhookAfterMeeting - Whether to automatically post the webhook after the meeting
 */
/**
 * @typedef {"auto" | "manual"} OperationMode - mode of the extension which decides whether to automatically capture transcripts or let the user decide per meeting basis
 */
/**
 * @typedef {"simple" | "advanced"} WebhookBodyType - type of webhook body to use
 */
/**
 * @typedef {string} WebhookUrl - URL of the webhook
 */



/** 
 * @typedef {Object} ExtensionMessage
 * @property {"new_meeting_started" | "meeting_ended" | "download_transcript_at_index" | "retry_webhook_at_index" | "recover_last_meeting"} type - type of message
 * @property {number} [index] - index of the meeting to process
 */

/** 
 * @typedef {Object} ExtensionResponse
 * @property {boolean} success - whether the message was processed successfully
 * @property {string} [message] - message explaining success or failure
 */