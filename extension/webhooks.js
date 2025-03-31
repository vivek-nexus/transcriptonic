document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")
    const simpleWebhookBodyRadio = document.querySelector("#simple-webhook-body")
    const advancedWebhookBodyRadio = document.querySelector("#advanced-webhook-body")

    // Initially disable the save button
    saveButton.disabled = true

    // Load saved webhook URL, auto-post setting, and webhook body type
    chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "webhookBodyType"], function (result) {
        if (result.webhookUrl) {
            webhookUrlInput.value = result.webhookUrl
            saveButton.disabled = !webhookUrlInput.checkValidity()
        }
        // Set checkbox state, default to true if not set
        autoPostCheckbox.checked = result.autoPostWebhookAfterMeeting !== false
        // Set radio button state, default to simple if not set
        if (result.webhookBodyType === "advanced") {
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
    saveButton.addEventListener("click", async function () {
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
                    alert("Webhook settings saved!")
                })
            }).catch((error) => {
                alert("Fine! No webhooks for you!")
                console.error("Webhook permission error:", error)
            })
        }
    })

    // Initial load of transcripts
    loadTranscripts()

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadTranscripts()
        }
    })
})


// Request runtime permission for webhook URL
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
                    resolve()
                } else {
                    reject(new Error("Permission denied"))
                }
            }).catch((error) => {
                reject(error)
            })
        } catch (error) {
            reject(new Error("Invalid URL format"))
        }
    })
}

// Load and display recent transcripts
function loadTranscripts() {
    const meetingsTable = document.querySelector("#transcripts-table")

    chrome.storage.local.get(["meetings"], function (result) {
        // Clear existing content
        meetingsTable.innerHTML = ""

        if (result.meetings && result.meetings.length > 0) {
            // Loop through the array in reverse order to list latest meeting first
            for (let i = result.meetings.length - 1; i >= 0; i--) {
                const meeting = result.meetings[i]
                const timestamp = new Date(meeting.meetingStartTimestamp).toLocaleString()
                const durationString = getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp)

                const row = document.createElement("tr")
                row.innerHTML = `
                    <td>${meeting.title}</td>
                    <td>${timestamp} &nbsp; &#9679; &nbsp; ${durationString}</td>
                    <td>
                        ${(
                        () => {
                            switch (meeting.webhookPostStatus) {
                                case "successful":
                                    return `<span class="status-success">Successful</span>`
                                case "failed":
                                    return `<span class="status-failed">Failed</span>`
                                case "new":
                                    return `<span class="status-new">New</span>`
                                default:
                                    return `<span class="status-new">Unknown</span>`
                            }
                        }
                    )()}
                    </td>
                    <td style="min-width: 96px;">
                        <button class="post-button" data-index="${i}">${meeting.webhookPostStatus === "new" ? `Post` : `Repost`}</button>
                    </td>
                `
                meetingsTable.appendChild(row)

                // Add event listener to the post button
                const button = row.querySelector(".post-button")
                button.addEventListener("click", function () {
                    chrome.storage.sync.get(["webhookUrl"], function (result) {
                        if (result.webhookUrl) {
                            // Disable button and update text
                            button.disabled = true
                            button.textContent = meeting.webhookPostStatus === "new" ? "Posting..." : "Reposting..."

                            // Send message to background script to post webhook
                            const index = parseInt(button.getAttribute("data-index"))
                            chrome.runtime.sendMessage({
                                type: "retry_webhook_at_index",
                                index: index
                            }, response => {
                                loadTranscripts()
                                if (response.success) {
                                    alert("Posted successfully!")
                                }
                            })
                        }
                        else {
                            alert("Please provide a webhook URL")
                        }
                    })
                })
            }
        }
        else {
            meetingsTable.innerHTML = `<tr><td colspan="4">Your next meeting will show up here</td></tr>`
        }
    })
}

// Format duration between two timestamps, specified in milliseconds elapsed since the epoch
function getDuration(meetingStartTimestamp, meetingEndTimestamp) {
    const duration = new Date(meetingEndTimestamp) - new Date(meetingStartTimestamp)
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}