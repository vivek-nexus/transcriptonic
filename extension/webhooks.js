document.addEventListener('DOMContentLoaded', function () {
    const webhookUrlInput = document.querySelector('#webhook-url')
    const saveButton = document.querySelector('#save-webhook')
    const transcriptsTable = document.querySelector('#transcripts-table')

    // Initially disable the save button
    saveButton.disabled = true

    // Load saved webhook URL
    chrome.storage.local.get(['webhookUrl'], function (result) {
        if (result.webhookUrl) {
            webhookUrlInput.value = result.webhookUrl
            saveButton.disabled = !webhookUrlInput.checkValidity()
        }
    })

    // Handle URL input changes
    webhookUrlInput.addEventListener('input', function () {
        saveButton.disabled = !this.value || !this.checkValidity()
    })

    // Request runtime permission for webhook URL
    function requestWebhookPermission(url) {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url)
                const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

                // Request both host and notifications permissions
                chrome.permissions.request({
                    origins: [originPattern],
                    permissions: ['notifications']
                }).then((granted) => {
                    if (granted) {
                        resolve()
                    } else {
                        reject(new Error('Permission denied'))
                    }
                }).catch((error) => {
                    reject(error)
                })
            } catch (error) {
                reject(new Error('Invalid URL format'))
            }
        })
    }

    // Save webhook URL
    saveButton.addEventListener('click', async function () {
        const webhookUrl = webhookUrlInput.value
        if (webhookUrl && webhookUrlInput.checkValidity()) {
            try {
                // Request runtime permission for the webhook URL
                await requestWebhookPermission(webhookUrl)

                // Save webhook URL
                chrome.storage.local.set({ webhookUrl: webhookUrl }, function () {
                    alert('Webhook URL saved successfully!')
                    console.log('Webhook URL saved')
                })
            } catch (error) {
                alert('Failed to save webhook URL. Please allow permission when prompted.')
                console.error('Webhook permission error:', error)
            }
        }
    })

    // Load and display recent transcripts
    function loadTranscripts() {
        chrome.storage.local.get(['recentTranscripts'], function (result) {
            transcriptsTable.innerHTML = '' // Clear existing content

            if (result.recentTranscripts && result.recentTranscripts.length > 0) {
                // Loop through the array in reverse order
                for (let i = result.recentTranscripts.length - 1; i >= 0; i--) {
                    const transcript = result.recentTranscripts[i]
                    const date = new Date(transcript.meetingStartTimeStamp)
                    const formattedDate = date.toLocaleString()

                    const row = document.createElement('tr')
                    row.innerHTML = `
                        <td>${transcript.meetingTitle}</td>
                        <td>${formattedDate}</td>
                        <td>
                            ${transcript.webhookPostStatus === "successful" ?
                            '<span class="status-success">Successful</span>' :
                            transcript.webhookPostStatus === "failed" ?
                                '<span class="status-failed">Failed</span>' :
                                '<span class="status-new">New</span>'
                        }
                            <button class="retry-button" data-index="${i}">Repost</button>
                        </td>
                    `
                    transcriptsTable.appendChild(row)
                }

                // Add event listeners to retry buttons
                document.querySelectorAll('.retry-button').forEach(button => {
                    button.addEventListener('click', function () {
                        const index = parseInt(this.getAttribute('data-index'))

                        // Send message to background script to retry webhook
                        chrome.runtime.sendMessage({
                            type: 'retry_webhook',
                            index: index
                        }, response => {
                            if (response && response.success) {
                                // Refresh the table to show updated status
                                loadTranscripts()
                            } else {
                                alert('Failed to retry webhook. Please check your webhook URL configuration.')
                                // Refresh the table to show updated status
                                loadTranscripts()
                            }
                        })
                    })
                })
            } else {
                transcriptsTable.innerHTML = '<tr><td colspan="3">No transcripts available</td></tr>'
            }
        })
    }

    // Initial load of transcripts
    loadTranscripts()
}) 