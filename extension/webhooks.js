document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const transcriptsTable = document.querySelector("#transcripts-table")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")

    // Initially disable the save button
    saveButton.disabled = true

    // Load saved webhook URL and auto-post setting
    chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting"], function (result) {
        if (result.webhookUrl) {
            webhookUrlInput.value = result.webhookUrl
            saveButton.disabled = !webhookUrlInput.checkValidity()
        }
        // Set checkbox state, default to true if not set
        autoPostCheckbox.checked = result.autoPostWebhookAfterMeeting !== false
    })

    // Handle URL input changes
    webhookUrlInput.addEventListener("input", function () {
        saveButton.disabled = !this.value || !this.checkValidity()
        autoPostCheckbox.disabled = !this.value || !this.checkValidity()
    })

    // Save webhook URL and auto-post setting
    saveButton.addEventListener("click", async function () {
        const webhookUrl = webhookUrlInput.value
        if (webhookUrl && webhookUrlInput.checkValidity()) {
            // Request runtime permission for the webhook URL
            requestWebhookAndNotificationPermission(webhookUrl).then(() => {
                // Save webhook URL and auto-post setting
                chrome.storage.sync.set({
                    webhookUrl: webhookUrl,
                    autoPostWebhookAfterMeeting: autoPostCheckbox.checked
                }, function () {
                    alert("Settings saved!")
                })
            }).catch((error) => {
                alert("Fine! No webhooks for you!")
                console.error("Webhook permission error:", error)
            })
        }
    })

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadTranscripts()
        }
    })

    // Load and display recent transcripts
    function loadTranscripts() {
        chrome.storage.local.get(["recentTranscripts"], function (result) {
            // Clear existing content
            transcriptsTable.innerHTML = ""

            if (result.recentTranscripts && result.recentTranscripts.length > 0) {
                // Loop through the array in reverse order to list latest meeting first
                for (let i = result.recentTranscripts.length - 1; i >= 0; i--) {
                    const transcript = result.recentTranscripts[i]
                    const date = new Date(transcript.meetingStartTimeStamp).toLocaleString()

                    const row = document.createElement("tr")
                    row.innerHTML = `
                        <td>${transcript.meetingTitle}</td>
                        <td>${date}</td>
                        <td>
                            ${transcript.webhookPostStatus === "successful"
                            ? `<span class="status-success">Successful</span>`
                            : transcript.webhookPostStatus === "failed"
                                ? `<span class="status-failed">Failed</span>`
                                : `<span class="status-new">New</span>`}
                        </td>
                        <td style="min-width: 96px;">
                            <button class="post-button" data-index="${i}">${transcript.webhookPostStatus === "new" ? `Post` : `Repost`}</button>
                        </td>
                    `
                    transcriptsTable.appendChild(row)

                    // Add event listener to the post button
                    const button = row.querySelector(".post-button")
                    button.addEventListener("click", function () {
                        chrome.storage.sync.get(["webhookUrl"], function (result) {
                            if (result.webhookUrl) {
                                // Disable button and update text
                                button.disabled = true
                                button.textContent = transcript.webhookPostStatus === "new" ? "Posting..." : "Reposting..."

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
            } else {
                transcriptsTable.innerHTML = `<tr><td colspan="3">No transcripts available</td></tr>`
            }
        })
    }

    // Initial load of transcripts
    loadTranscripts()
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