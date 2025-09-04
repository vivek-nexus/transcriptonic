// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlForm = document.querySelector("#webhook-url-form")
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")
    const simpleWebhookBodyRadio = document.querySelector("#simple-webhook-body")
    const advancedWebhookBodyRadio = document.querySelector("#advanced-webhook-body")
    const recoverLastMeetingButton = document.querySelector("#recover-last-meeting")

    // Initial load of transcripts
    loadMeetings()

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadMeetings()
        }
    })

    if (recoverLastMeetingButton instanceof HTMLButtonElement) {
        recoverLastMeetingButton.addEventListener("click", function () {
            /** @type {ExtensionMessage} */
            const message = {
                type: "recover_last_meeting",
            }
            chrome.runtime.sendMessage(message, function (responseUntyped) {
                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                loadMeetings()
                scrollTo({ top: 0, behavior: "smooth" })
                if (response.success) {
                    if (response.message === "No recovery needed") {
                        alert(t("alert_nothing_to_recover", "Nothing to recover—you're on top of the world!"))
                    }
                    else {
                        alert(t("alert_recovered_success", "Last meeting recovered successfully!"))
                    }
                }
                else {
                    if (response.message === "No meetings found. May be attend one?") {
                        alert(t("alert_no_meetings_found", response.message))
                    }
                    else if (response.message === "Empty transcript and empty chatMessages") {
                        alert(t("alert_empty_transcript", "Nothing to recover—you're on top of the world!"))
                    }
                    else {
                        alert(t("alert_could_not_recover", "Could not recover last meeting!"))
                        console.error(response.message)
                    }
                }
            })
        })
    }

    if (saveButton instanceof HTMLButtonElement && webhookUrlForm instanceof HTMLFormElement && webhookUrlInput instanceof HTMLInputElement && autoPostCheckbox instanceof HTMLInputElement && simpleWebhookBodyRadio instanceof HTMLInputElement && advancedWebhookBodyRadio instanceof HTMLInputElement) {
        // Initially disable the save button
        saveButton.disabled = true

        // Load saved webhook URL, auto-post setting, and webhook body type
        chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "webhookBodyType"], function (resultSyncUntyped) {
            const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

            if (resultSync.webhookUrl) {
                webhookUrlInput.value = resultSync.webhookUrl
                saveButton.disabled = !webhookUrlInput.checkValidity()
            }
            // Set checkbox state, default to true if not set
            autoPostCheckbox.checked = resultSync.autoPostWebhookAfterMeeting !== false
            // Set radio button state, default to simple if not set
            if (resultSync.webhookBodyType === "advanced") {
                advancedWebhookBodyRadio.checked = true
            } else {
                simpleWebhookBodyRadio.checked = true
            }
        })

        // Handle URL input changes
        webhookUrlInput.addEventListener("input", function () {
            saveButton.disabled = !webhookUrlInput.value || !webhookUrlInput.checkValidity()
        })

        // Save webhook URL, auto-post setting, and webhook body type
        webhookUrlForm.addEventListener("submit", function (e) {
            e.preventDefault()
            const webhookUrl = webhookUrlInput.value
            if (webhookUrl && webhookUrlInput.checkValidity()) {
                // Request runtime permission for the webhook URL
                requestWebhookAndNotificationPermission(webhookUrl).then(() => {
                    // Save webhook URL and settings
                    chrome.storage.sync.set({
                        webhookUrl: webhookUrl,
                        autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
                        webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple"
                    }, function () {
                        alert(t("alert_webhook_saved", "Webhook URL saved!"))
                    })
                }).catch((error) => {
                    alert(t("alert_webhook_denied", "Fine! No webhooks for you!"))
                    console.error("Webhook permission error:", error)
                })
            }
        })

        // Auto save auto-post setting
        autoPostCheckbox.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({
                autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
            }, function () { })
        })

        // Auto save webhook body type
        simpleWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: "simple" }, function () { })
        })

        // Auto save webhook body type
        advancedWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple" }, function () { })
        })
    }
})


// Request runtime permission for webhook URL
/**
 * @param {string} url
 */
function requestWebhookAndNotificationPermission(url) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url)
            const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

            // Request both host and notifications permissions
            chrome.permissions.request({
                origins: [originPattern],
                permissions: ["notifications"]
            }).then((granted) => {
                if (granted) {
                    resolve("Permission granted")
                } else {
                    reject(new Error("Permission denied"))
                }
            }).catch((error) => {
                reject(error)
            })
        } catch (error) {
            reject(error)
        }
    })
}

// Load and display recent transcripts
function loadMeetings() {
    const meetingsTable = document.querySelector("#transcripts-table")

    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
        // Clear existing content
        if (meetingsTable) {
            meetingsTable.innerHTML = ""


            if (resultLocal.meetings && resultLocal.meetings.length > 0) {
                // Loop through the array in reverse order to list latest meeting first
                for (let i = resultLocal.meetings.length - 1; i >= 0; i--) {
                    const meeting = resultLocal.meetings[i]
                    const timestamp = new Date(meeting.meetingStartTimestamp).toLocaleString()
                    const durationString = getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp)

                    const row = document.createElement("tr")
                    row.innerHTML = `
                    <td>${meeting.meetingTitle || meeting.title || t("meetings_default_meeting_title", "Google Meet call")}</td>
                    <td>${timestamp}</td>
                    <td>
                        ${(
                            () => {
                                switch (meeting.webhookPostStatus) {
                                    case "successful":
                                        return `<span class=\"status-success\">${t("meetings_status_successful", "Successful")}</span>`
                                    case "failed":
                                        return `<span class=\"status-failed\">${t("meetings_status_failed", "Failed")}</span>`
                                    case "new":
                                        return `<span class=\"status-new\">${t("meetings_status_new", "New")}</span>`
                                    default:
                                        return `<span class=\"status-new\">${t("meetings_status_unknown", "Unknown")}</span>`
                                }
                            }
                        )()}
                    </td>
                    <td>
                        <div style="min-width: 200px; display: flex; gap: 0.5rem; align-items: center;">
                            <button class="download-button" data-index="${i}" style="background: #1a73e8; color: white; border: none; border-radius: 4px; padding: 6px 12px; display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;">
                                <img src="./icons/download.svg" alt="${t("meetings_download_alt", "Download this meeting transcript")}" style="width: 16px; height: 16px;">
                            </button>
                            <button class="post-button" data-index="${i}" style="background: #34a853; color: white; border: none; border-radius: 4px; padding: 6px 12px; display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;">
                                ${meeting.webhookPostStatus === "new" ? t("meetings_action_post", "Post") : t("meetings_action_repost", "Repost")}
                                <img src="./icons/webhook.svg" alt="" width="16px" style="filter: brightness(0) invert(1);">
                            </button>
                            <a href="./ai/chat.html?meetingId=${encodeURIComponent(meeting.meetingStartTimestamp)}" target="_blank" data-index="${i}" style="background: #ea4335; color: white; text-decoration: none; border-radius: 4px; padding: 6px 12px; display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#d33b2c'" onmouseout="this.style.backgroundColor='#ea4335'">
                                <img src="./icons/chat.svg" alt="AI Chat" style="width: 16px; height: 16px; filter: brightness(0) invert(1);">
                                Chat
                            </a>
                            <a href="./ai/report.html?meetingId=${encodeURIComponent(meeting.meetingStartTimestamp)}" target="_blank" data-index="${i}" style="background: #fbbc04; color: #1f1f1f; text-decoration: none; border-radius: 4px; padding: 6px 12px; display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9ab00'" onmouseout="this.style.backgroundColor='#fbbc04'">
                                <img src="./icons/ai.svg" alt="AI Report" style="width: 16px; height: 16px;">
                                Report
                            </a>
                        </div>
                    </td>
                `
                    meetingsTable.appendChild(row)

                    // Add event listener to the download button
                    const downloadButton = row.querySelector(".download-button")
                    if (downloadButton instanceof HTMLButtonElement) {
                        // Add hover effects
                        downloadButton.addEventListener("mouseenter", function () {
                            this.style.backgroundColor = "#1557b0"
                        })
                        downloadButton.addEventListener("mouseleave", function () {
                            this.style.backgroundColor = "#1a73e8"
                        })
                        
                        downloadButton.addEventListener("click", function () {
                            // Send message to background script to download text file
                            const index = parseInt(downloadButton.getAttribute("data-index") ?? "-1")
                            /** @type {ExtensionMessage} */
                            const message = {
                                type: "download_transcript_at_index",
                                index: index
                            }
                            chrome.runtime.sendMessage(message, (responseUntyped) => {
                                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                loadMeetings()
                                if (!response.success) {
                                    alert(t("alert_could_not_download", "Could not download transcript"))
                                }
                            })
                        })
                    }

                    // Add event listener to the webhook post button
                    const webhookPostButton = row.querySelector(".post-button")
                    if (webhookPostButton instanceof HTMLButtonElement) {
                        // Add hover effects
                        webhookPostButton.addEventListener("mouseenter", function () {
                            this.style.backgroundColor = "#2d8f47"
                        })
                        webhookPostButton.addEventListener("mouseleave", function () {
                            this.style.backgroundColor = "#34a853"
                        })
                        
                        webhookPostButton.addEventListener("click", function () {
                            chrome.storage.sync.get(["webhookUrl"], function (resultSyncUntyped) {
                                const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                                if (resultSync.webhookUrl) {
                                    // Request runtime permission for the webhook URL. Needed for cases when user signs on a new browser—webhook URL and other sync variables are available, but runtime permissions will be missing.
                                    requestWebhookAndNotificationPermission(resultSync.webhookUrl).then(() => {
                                        // Disable button and update text
                                        webhookPostButton.disabled = true
                                        webhookPostButton.textContent = meeting.webhookPostStatus === "new" ? t("meetings_action_posting", "Posting...") : t("meetings_action_reposting", "Reposting...")

                                        // Send message to background script to post webhook
                                        const index = parseInt(webhookPostButton.getAttribute("data-index") ?? "-1")
                                        /** @type {ExtensionMessage} */
                                        const message = {
                                            type: "retry_webhook_at_index",
                                            index: index
                                        }
                                        chrome.runtime.sendMessage(message, (responseUntyped) => {
                                            const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                            loadMeetings()
                                            if (response.success) {
                                                alert(t("alert_posted_success", "Posted successfully!"))
                                            }
                                            else {
                                                console.error(response.message)
                                            }
                                        })
                                    }).catch((error) => {
                                        alert(t("alert_webhook_denied", "Fine! No webhooks for you!"))
                                        console.error("Webhook permission error:", error)
                                    })
                                }
                                else {
                                    alert(t("alert_provide_webhook", "Please provide a webhook URL"))
                                }
                            })
                        })
                    }
                }
            }
            else {
                meetingsTable.innerHTML = `<tr><td colspan="4">${t("meetings_empty_state", "Your next meeting will show up here")}</td></tr>`
            }
        }
    })
}

// Format duration between two timestamps, specified in milliseconds elapsed since the epoch
/**
 * @param {string} meetingStartTimestamp - ISO timestamp
 * @param {string} meetingEndTimestamp - ISO timestamp
 */
function getDuration(meetingStartTimestamp, meetingEndTimestamp) {
    const duration = new Date(meetingEndTimestamp).getTime() - new Date(meetingStartTimestamp).getTime()
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}