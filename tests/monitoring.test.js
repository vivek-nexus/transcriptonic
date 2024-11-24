const puppeteer = require('puppeteer-core');
const player = require('node-wav-player');


const browserURL = 'http://127.0.0.1:21222';

let browser;
let page;

beforeAll(async () => {
  browser = await puppeteer.connect({ browserURL });
  page = await browser.newPage();
  page.setViewport(null)
});

afterAll(async () => {
  // End meeting
  await page
    .locator('[aria-label="Leave call"')
    .click();

  await new Promise(r => setTimeout(r, 2000));

  await browser.close();
}, 100000);

describe('Check presence of selectors', () => {
  test('Username exists', async () => {
    await page.goto('https://meet.google.com/qea-oqjv-gjw');

    const username = await page.$('.awLEm');
    expect(username).not.toBeNull();

    // Turn off camera
    await page
      .locator('[data-tooltip="Turn off camera (CTRL + E)"]')
      .click()

    // Start meeting
    await page.
      locator('button ::-p-text(Join now)').
      click();
  }, 100000);

  test('End call button exists', async () => {
    await new Promise(r => setTimeout(r, 5000));

    const endCallButton = await page.$('.google-symbols ::-p-text(call_end)');
    expect(endCallButton).not.toBeNull();
  }, 100000);

  test('Captions button exists', async () => {
    const captionsButton = await page.$('.google-symbols ::-p-text(closed_caption_off)');
    expect(captionsButton).not.toBeNull();
  });

  test('Captions node exists', async () => {
    const captionsNode = await page.$('.a4cQT');
    expect(captionsNode).not.toBeNull();
  });

  test('Chat button exists', async () => {
    const chatButton = await page.$('.google-symbols ::-p-text(chat)');
    expect(chatButton).not.toBeNull();
  });

  test('Chat messages node exists', async () => {
    const chatMessagesNode = await page.$('div[aria-live="polite"]');
    expect(chatMessagesNode).not.toBeNull();
  });

  test('Meeting title exists', async () => {
    const meetingTitle = await page.$('.u6vdEc');
    expect(meetingTitle).not.toBeNull();
  });
});

describe('Check validity of DOM', () => {
  test('Chat DOM valid', async () => {
    await page
      .locator('.google-symbols ::-p-text(chat)')
      .click()
    await new Promise(r => setTimeout(r, 1000));
    await page
      .type('[aria-label="Send a message to everyone"]', "Hello, this is a test chat message")
    await new Promise(r => setTimeout(r, 1000));
    page.keyboard.press('Enter')

    await new Promise(r => setTimeout(r, 1000));

    const chatMessageElement = await page.evaluateHandle(() => {
      document.querySelectorAll('div[aria-live="polite"]')[0].lastChild
    })
    const personName = await page.evaluateHandle(() => {
      document.querySelectorAll('div[aria-live="polite"]')[0].lastChild.firstChild.firstChild
    })
    const chatMessageText = await page.evaluateHandle(() => {
      document.querySelectorAll('div[aria-live="polite"]')[0].lastChild.lastChild.lastChild
    })

    await page
      .locator('.google-symbols ::-p-text(chat_bubble)')
      .click()

    expect(chatMessageElement && personName && chatMessageText).not.toBeNull();
  }, 100000);

  test('Transcript DOM valid', async () => {
    // Play mock voice
    player.play({
      path: './test-person.wav',
      sync: true
    }).catch((error) => {
      console.error(error);
    });

    // Allow the audio to play fully
    await new Promise(r => setTimeout(r, 5000));

    const people = await page.evaluateHandle(() => {
      const people = document.querySelector('.a4cQT').childNodes[1].firstChild.childNodes
      return people
    })

    const person = await page.evaluateHandle(() => {
      const people = document.querySelector('.a4cQT').childNodes[1].firstChild.childNodes
      const person = people[people.length - 1]
      return person
    })

    const currentPersonName = await page.evaluateHandle(() => {
      const people = document.querySelector('.a4cQT').childNodes[1].firstChild.childNodes
      const person = people[people.length - 1]
      const currentPersonName = person.childNodes[0]
      return currentPersonName
    })

    const currentTranscriptText = await page.evaluateHandle(() => {
      const people = document.querySelector('.a4cQT').childNodes[1].firstChild.childNodes
      const person = people[people.length - 1]
      const currentTranscriptText = person.childNodes[1].lastChild
      return currentTranscriptText
    })

    expect(people && person && currentPersonName && currentTranscriptText).not.toBeNull();
  }, 100000);
});













// const puppeteer = require('puppeteer-core');

// const browserURL = 'http://127.0.0.1:21222';

// (async () => {
//   // Launch the browser and open a new blank page
//   const browser = await puppeteer.connect({
//     browserURL
//   });
//   const page = await browser.newPage();

//   // Navigate the page to a URL
//   await page.goto('https://meet.google.com/qea-oqjv-gjw');

//   try {

//     // Turn off camera
//     await page
//       .locator('[data-tooltip="Turn off camera (CTRL + E)"]')
//       .click();

//     // TEST
//     console.log("Username: " + !! await page.$(".awLEm"))

//     // Start meeting
//     await page.
//       locator('button ::-p-text(Join now)').
//       click();

//     await new Promise(r => setTimeout(r, 5000));

//     // TEST
//     console.log("End call button: " + !! await page.$('.google-symbols ::-p-text(call_end)'))

//     // TEST
//     console.log("Captions button: " + !! await page.$('.google-symbols ::-p-text(closed_caption_off)'))

//     // TEST
//     console.log("Captions node: " + !! await page.$('.a4cQT'))

//     // TEST
//     console.log("Chat messages button: " + !! await page.$('.google-symbols ::-p-text(chat)'))

//     // TEST
//     console.log("Chat message node: " + !! await page.$('div[aria-live="polite"]'))

//     // TEST
//     console.log("Meeting title: " + !! await page.$(".u6vdEc"))

//     // End meeting
//     await page
//       .locator('[aria-label="Leave call"')
//       .click();
//   }
//   catch (error) {
//     console.log(error)
//   }

//   await browser.close();
// })();
