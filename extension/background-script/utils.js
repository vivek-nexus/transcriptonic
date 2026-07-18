import { ALARM_NAME, INTERVAL_IN_MINUTES, TIMEFORMAT } from "./config.js"
import { getPermissionStatus } from "./platforms.js"


export function checkAndCreateAlarm() {
    chrome.alarms.get(ALARM_NAME, (alarm) => {
        if (!alarm) {
            chrome.alarms.create(ALARM_NAME, {
                periodInMinutes: INTERVAL_IN_MINUTES
            })
            console.log(`Alarm "${ALARM_NAME}" created successfully.`)
        } else {
            console.log(`Alarm "${ALARM_NAME}" already exists. Next scheduled run:`, new Date(alarm.scheduledTime))
        }
    })
}

/**
 * Format transcript entries into string
 * @param {TranscriptBlock[] | []} transcript
 */
export function getTranscriptString(transcript) {
    let transcriptString = ""
    if (transcript.length > 0) {
        transcript.forEach(transcriptBlock => {
            transcriptString += `${transcriptBlock.personName} (${new Date(transcriptBlock.timestamp).toLocaleString("default", TIMEFORMAT).toUpperCase()})\n`
            transcriptString += transcriptBlock.transcriptText
            transcriptString += "\n\n"
        })
        return transcriptString
    }
    return transcriptString
}

/**
 * Format chat messages into string
 * @param {ChatMessage[] | []} chatMessages
 */
export function getChatMessagesString(chatMessages) {
    let chatMessagesString = ""
    if (chatMessages.length > 0) {
        chatMessages.forEach(chatMessage => {
            chatMessagesString += `${chatMessage.personName} (${new Date(chatMessage.timestamp).toLocaleString("default", TIMEFORMAT).toUpperCase()})\n`
            chatMessagesString += chatMessage.chatMessageText
            chatMessagesString += "\n\n"
        })
    }
    return chatMessagesString
}

export function clearTabIdAndApplyUpdate() {
    // Nullify to indicate end of meeting processing
    chrome.storage.local.set({ meetingTabId: null }, function () {
        console.log("Meeting tab id cleared for next meeting")

        // Check if there's a deferred update
        chrome.storage.local.get(["isDeferredUpdatedAvailable"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.isDeferredUpdatedAvailable) {
                console.log("Applying deferred update")
                chrome.storage.local.set({ isDeferredUpdatedAvailable: false }, function () {
                    chrome.runtime.reload()
                })
            }
        })
    })
}

/**
 * Opens the extension popup programmatically.
 */
export function openExtensionPopup() {
    return new Promise((resolve, reject) => {
        chrome.action.openPopup()
            .then(() => {
                console.log("Popup opened successfully")
                resolve("Popup opened")
            })
            .catch((error) => {
                console.error("Failed to open popup:", error)
                reject("Failed to open popup")
            })
    })
}

export function checkPermissionsAndOpenMeetingsPage() {
    console.log("Check permissions")
    chrome.storage.sync.get(["wantGoogleMeet", "wantTeams", "wantZoom"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

        /** @type {Platform[]} */
        const wantedPlatforms = []
        //  Consider enabled if user has not explicitly opted out
        if (resultSync.wantGoogleMeet) {
            wantedPlatforms.push("google_meet")
        }
        if (resultSync.wantTeams) {
            wantedPlatforms.push("teams")
        }
        if (resultSync.wantZoom) {
            wantedPlatforms.push("zoom")
        }

        /** @type {ExtensionMessage} */
        const message = {
            type: "get_platform_permission_status",
            platform: wantedPlatforms
        }
        getPermissionStatus(wantedPlatforms).then((result) => {
            console.log(result)

            /** @type {Platform[]} */
            const permissionMissingPlatforms = []

            for (let i = 0; i < wantedPlatforms.length; i++) {
                if (Array.isArray(result) && result[i] === "Disabled") {
                    permissionMissingPlatforms.push(wantedPlatforms[i])
                }
            }

            if (permissionMissingPlatforms.length > 0) {
                console.log(permissionMissingPlatforms)
                chrome.tabs.create({
                    url: chrome.runtime.getURL("meetings.html")
                })
            }
        })
    })
}