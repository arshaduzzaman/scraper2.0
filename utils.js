const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
};

const loginToFacebook = async (page) => {
  await page.type("#email", process.env.FB_EMAIL);
  await page.type("#pass", process.env.FB_PASSWORD);
  await page.click("button[name='login']");
  await page.waitForNavigation({ waitUntil: "networkidle2" });
};

const navigateAndScroll = async (page, url) => {
  await page.goto(url, { waitUntil: "networkidle2" });
  await autoScroll(page);
};

const processResponse = async (response, postsCollection) => {
  const responseBody = await response.text();
  const jsonData = JSON.parse(jsonrepair(responseBody));
  const posts = await extractPostDetails(jsonData);
  if (posts.length > 0) {
    await postsCollection.insertMany(posts);
  }
};

module.exports = {
  autoScroll,
  loginToFacebook,
  navigateAndScroll,
  processResponse,
};
