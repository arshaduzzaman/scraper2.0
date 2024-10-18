const puppeteer = require("puppeteer");
const fs = require("fs");
const { jsonrepair } = require("jsonrepair");
const { initializeDatabase, client } = require("./mongodb");
const { autoScroll, loginToFacebook, navigateAndScroll, processResponse } = require("./utils");

// Modify the extractPostDetails function to include the postId as _id
async function extractPostDetails(jsonData) {
  const posts = [];

  // Traverse the posts within the "edges"
  jsonData.forEach((item) => {
    const node = item?.data?.node;

    let caption;
    let feedback;
    let postId;
    let creationTime;
    let articleLink;
    let imageLink;

    if (node?.timeline_list_feed_units) {
      feedback =
        node?.timeline_list_feed_units?.edges[0]?.node
          ?.comet_sections?.feedback?.story?.story_ufi_container?.story
          ?.feedback_context?.feedback_target_with_context
          ?.comet_ufi_summary_and_actions_renderer?.feedback;

      postId =
        node?.timeline_list_feed_units?.edges[0]?.node?.post_id;

      creationTime =
        node?.timeline_list_feed_units?.edges[0]?.node?.comet_sections
          ?.context_layout?.story?.comet_sections?.metadata[0]?.story
          ?.creation_time;

      caption =
        node?.timeline_list_feed_units?.edges[0]?.node?.comet_sections?.content
          ?.story?.message?.text;

      articleLink =
        node?.timeline_list_feed_units?.edges[0]?.node?.comet_sections?.content
          ?.story?.attachments[0]?.styles?.attachment
          ?.story_attachment_link_renderer?.attachment?.web_link?.url;

      imageLink =
        node?.timeline_list_feed_units?.edges[0]?.node?.comet_sections?.content
          ?.story?.attachments[0]?.styles?.attachment?.media?.photo_image?.uri;
    } else if (node?.comet_sections) {
      feedback =
        node?.comet_sections?.feedback?.story?.story_ufi_container
          ?.story?.feedback_context?.feedback_target_with_context
          ?.comet_ufi_summary_and_actions_renderer?.feedback;

      postId = node?.post_id;

      caption = node?.comet_sections?.content?.story?.message?.text;

      creationTime =
        node?.comet_sections?.context_layout?.story?.comet_sections?.metadata[0]
          ?.story?.creation_time;

      articleLink =
        node?.comet_sections?.content?.story?.attachments[0]?.styles?.attachment
          ?.story_attachment_link_renderer?.attachment?.web_link?.url;

      imageLink =
        node?.comet_sections?.content?.story?.attachments[0]?.styles?.attachment
          ?.media?.photo_image?.uri;
    }

    if (feedback) {
      const post = {
        _id: postId, // Use postId as _id
        caption,
        creationTime,
        articleLink,
        imageLink,
        feedback: {
          reactions: feedback?.reaction_count?.count,
          shares: feedback?.share_count?.count,
          comments: feedback?.comment_rendering_instance?.comments?.total_count,
        },
      };

      // Add the post to the posts array
      posts.push(post);
    }
  });

  return posts;
}

const main = async () => {
  await initializeDatabase();
  const db = client.db("tyger-scraper");
  const coll = db.collection("sources");
  const postsCollection = db.collection("scraped-posts");

  const cursor = coll.find();
  const sources = [];
  await cursor.forEach((source) => {
    sources.push(source.url);
  });

  // Launch the browser with notifications disabled
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-notifications", // This disables the notification popup
    ],
  });

  const page = await browser.newPage();

  // Listen for responses
  page.on("response", async (response) => {
    const url = response.url();
    // Check if the URL contains 'graphql' (or any specific string)
    if (url.includes("/api/graphql/")) {
      console.log(`Intercepted GraphQL API response from: ${url}`);
      await processResponse(response, postsCollection);
    }
  });

  // Navigate to the target page
  await page.goto("https://www.facebook.com", { waitUntil: "networkidle2" });

  // Log in to Facebook
  await loginToFacebook(page);

  // Infinite loop
  while (true) {
    for (const url of sources) {
      console.log(`Navigating to: ${url}`);

      // Navigate to each URL and scroll
      await navigateAndScroll(page, url);
    }
  }

  // The browser never closes, it keeps looping infinitely
};

main();
