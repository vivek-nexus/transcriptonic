const puppeteer = require('puppeteer-core');

const browserURL = 'http://127.0.0.1:21222';

let browser;
let page;

beforeAll(async () => {
  browser = await puppeteer.connect({ browserURL });
  page = await browser.newPage();
});

afterAll(async () => {
  // End meeting
  await page
    .locator('[aria-label="Leave call"')
    .click();

  await browser.close();
});

describe('Google Meet Test Suite', () => {
  test('Username exists on page', async () => {
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

  test('End call button exists after joining the meeting', async () => {
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
