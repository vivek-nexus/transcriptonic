// @ts-check
/// <reference path="../../types/chrome.d.ts" />
/// <reference path="../../types/index.js" />

import { getTranscriptString, getChatMessagesString } from './utils.js'
import { timeFormat } from './config.js'

/**
 * @param {number} index
 * @param {boolean} [isWebhookEnabled]
 * @throws error codes: 009, 010
 */
export function downloadTranscript(index, isWebhookEnabled) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.meetings && resultLocal.meetings[index]) {
                const meeting = resultLocal.meetings[index]

                // Sanitise meeting title to prevent invalid file name errors
                // https://stackoverflow.com/a/78675894
                const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
                let sanitisedMeetingTitle = "Meeting"
                if (meeting.meetingTitle) {
                    sanitisedMeetingTitle = meeting.meetingTitle.replaceAll(invalidFilenameRegex, "_")
                }
                else if (meeting.title) {
                    sanitisedMeetingTitle = meeting.title.replaceAll(invalidFilenameRegex, "_")
                }

                // Format timestamp for human-readable filename and sanitise to prevent invalid filenames
                const timestamp = new Date(meeting.meetingStartTimestamp)
                const formattedTimestamp = timestamp.toLocaleString("default", timeFormat).replace(/[\/:]/g, "-")

                const prefix = meeting.meetingSoftware ? `${meeting.meetingSoftware} transcript` : "Transcript"

                const fileName = `TranscripTonic/${prefix}-${sanitisedMeetingTitle} at ${formattedTimestamp} on.txt`


                // Format transcript and chatMessages content
                let content = getTranscriptString(meeting.transcript)
                content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
                content += getChatMessagesString(meeting.chatMessages)

                // Add branding
                content += "\n\n---------------\n"
                content += "Transcript saved using TranscripTonic Chrome extension (https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag)"
                content += "\n---------------"

                const blob = new Blob([content], { type: "text/plain" })

                // Read the blob as a data URL
                const reader = new FileReader()

                // Read the blob
                reader.readAsDataURL(blob)

                // Download as text file, once blob is read
                reader.onload = function (event) {
                    if (event.target?.result) {
                        const dataUrl = event.target.result

                        // Create a download with Chrome Download API
                        chrome.downloads.download({
                            // @ts-ignore
                            url: dataUrl,
                            filename: fileName,
                            conflictAction: "uniquify"
                        }).then(() => {
                            console.log("Transcript downloaded")
                            resolve("Transcript downloaded successfully")
                        }).catch((err) => {
                            console.error(err)
                            chrome.downloads.download({
                                // @ts-ignore
                                url: dataUrl,
                                filename: "TranscripTonic/Transcript.txt",
                                conflictAction: "uniquify"
                            })
                            console.log("Invalid file name. Transcript downloaded to TranscripTonic directory with simple file name.")
                            resolve("Transcript downloaded successfully with default file name")

                            // Logs anonymous errors to a Google sheet for swift debugging   
                            fetch(`https://script.google.com/macros/s/AKfycbz0VFUYIke1WK12Q-8y-zQ91bOPRZ8dAL4cRpm309IYZO0k6uYDkTSlfbWFaGvUV_Z-JQ/exec?version=${chrome.runtime.getManifest().version}&code=009&error=${encodeURIComponent(err)}&meetingSoftware=${meeting.meetingSoftware}`, { mode: "no-cors" })
                        })
                    }
                    else {
                        reject({ errorCode: "009", errorMessage: "Failed to read blob" })
                    }
                }
            }
            else {
                reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
            }
        })
    })
}

/**
 * @param {number} index
 * @throws error code: 010, 011, 012
 */
export function postTranscriptToWebhook(index) {
    return new Promise((resolve, reject) => {
        // Get webhook URL and meetings
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
            chrome.storage.sync.get(["webhookUrl", "webhookBodyType"], function (resultSyncUntyped) {
                const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

                if (resultSync.webhookUrl) {
                    if (resultLocal.meetings && resultLocal.meetings[index]) {
                        const meeting = resultLocal.meetings[index]

                        /** @type {WebhookBody} */
                        let webhookData
                        if (resultSync.webhookBodyType === "advanced") {
                            webhookData = {
                                webhookBodyType: "advanced",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toISOString(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toISOString(),
                                transcript: meeting.transcript,
                                chatMessages: meeting.chatMessages
                            }
                        }
                        else {
                            webhookData = {
                                webhookBodyType: "simple",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
                                transcript: getTranscriptString(meeting.transcript),
                                chatMessages: getChatMessagesString(meeting.chatMessages)
                            }
                        }

                        // Post to webhook
                        fetch(resultSync.webhookUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(webhookData)
                        }).then(response => {
                            if (!response.ok) {
                                throw new Error(`Webhook request failed with HTTP status code ${response.status} ${response.statusText}`)
                            }
                        }).then(() => {
                            // Update success status.
                            // @ts-ignore - Pointless type error about resultLocal.meetings being undefined, which is already checked above.
                            resultLocal.meetings[index].webhookPostStatus = "successful"
                            chrome.storage.local.set({ meetings: resultLocal.meetings }, function () {
                                resolve("Webhook posted successfully")
                            })
                        }).catch(error => {
                            console.error(error)
                            // Update failure status.
                            // @ts-ignore - Pointless type error about resultLocal.meetings being undefined, which is already checked above.
                            resultLocal.meetings[index].webhookPostStatus = "failed"
                            chrome.storage.local.set({ meetings: resultLocal.meetings }, function () {
                                // Create notification and open webhooks page
                                chrome.notifications.create({
                                    type: "basic",
                                    iconUrl: "icon.png",
                                    title: "Could not post webhook!",
                                    message: "Click to view status and retry. Check console for more details."
                                }, function (notificationId) {
                                    // Handle notification click
                                    chrome.notifications.onClicked.addListener(function (clickedNotificationId) {
                                        if (clickedNotificationId === notificationId) {
                                            chrome.tabs.create({ url: "meetings.html" })
                                        }
                                    })
                                })
                                reject({ errorCode: "011", errorMessage: error })
                            })
                        })
                    }
                    else {
                        reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
                    }
                }
                else {
                    reject({ errorCode: "012", errorMessage: "No webhook URL configured" })
                }
            })
        })
    })
}