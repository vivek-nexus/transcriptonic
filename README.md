# TranscripTonic
Simple Google Meet transcripts. Private and open source.

![marquee-large](/assets/marquee-large.png)

Extension status: 🟢 OPERATIONAL (v3.1.3)

<br />
<br />



# Demo
View video on [YouTube](https://www.youtube.com/watch?v=ARL6HbkakX4)

![demo](/assets/demo.gif)


<br />
<br />


# Installation
<a href="https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag" target="_blank">
    <img src="https://developer.chrome.com/static/docs/webstore/branding/image/iNEddTyWiMfLSwFD6qGq.png" />
</a>

<br />
<br />

# How to use TranscripTonic
![screenshot-2](/assets/screenshot-2.png)
TranscripTonic has two modes of operation.

**In both modes, transcript will be downloaded as a text file at the end of each meeting.**

- **Auto mode:** Automatically records transcripts for all meetings
- **Manual mode:** Switch on TranscripTonic by clicking on captions icon in Google Meet (CC icon)


<br />
<br />

# Integrating TranscripTonic with other tools using webhooks
You can integrate TranscripTonic with any tool that accepts data from a webhook. Refer the "Set up webhooks" page in the extension for details about the webhook body.
- [Google Docs integration guide](https://github.com/vivek-nexus/transcriptonic/wiki/Google-Docs-integration-guide)
- [n8n integration guide](https://github.com/vivek-nexus/transcriptonic/wiki/n8n-integration-guide)

<br />
<br />

# FAQs

**1. Can I change the language of the transcript?**

Yes. TranscripTonic picks up the output of Google Meet captions. Google Meet captions supports variety of languages that you can choose from. Click the settings icon when captions start showing and change the language.

**2. I did not get any transcript at the end of the meeting.**

This could happen when:
1. New errors caused by Google Meet updates
2. Any unexpected events like network drop, browser crashes etc.

When this happens, it might be possible to recover the transcript, but recovery should be done before starting another meeting.
- Open the extension and click on "last 10 meetings". Click on "Recover last meeting" button present after the table.
- TranscripTonic will also attempt to auto-recover any missed transcripts, just before a new meeting starts.

<br />
<br />

# Privacy policy
TranscripTonic Chrome extension does not collect any information from users in any manner, except anonymous errors and transcript download timestamp. All processing/transcript storage happens within the user's Chrome browser and does not leave the device, unless you configure a webhook and choose to post data to your webhook URL.

<br />
<br />

# Notice
The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.

<br />
<br />

# Installing unpacked extension
1. Download the unpacked extension zip file from GitHub using this [link](https://raw.githubusercontent.com/vivek-nexus/transcriptonic/refs/heads/main/extension-unpacked.zip)
2. Open `chrome://extensions` in a new Chrome tab
3. Enable "Developer mode" from top right corner
4. Drag and drop the unpacked extension zip file to complete the installation process
5. If drag and drop of zip file does not work, unzip the file. Click on "Load unpacked" in chrome extensions page and select the `extension-unpacked` folder to complete the installation process.
6. Remove unpacked extension when no longer needed. Your meeting data of unpacked extension and extension installed from Chrome Store, are stored separately.

<br />
<br />
