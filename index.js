const puppeteer = require("puppeteer");
const fs = require("fs");
const { jsonrepair } = require("jsonrepair");
const { initializeDatabase, client } = require("./mongodb");

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
        item?.data?.node?.timeline_list_feed_units?.edges[0]?.node
          ?.comet_sections?.feedback?.story?.story_ufi_container?.story
          ?.feedback_context?.feedback_target_with_context
          ?.comet_ufi_summary_and_actions_renderer?.feedback;

      postId =
        item?.data?.node?.timeline_list_feed_units?.edges[0]?.node?.post_id;

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
        item?.data?.node?.comet_sections?.feedback?.story?.story_ufi_container
          ?.story?.feedback_context?.feedback_target_with_context
          ?.comet_ufi_summary_and_actions_renderer?.feedback;

      postId = item?.data?.node?.post_id;

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
      try {
        // Get the raw response body as text
        const responseBody = await response.text();
        const fixedData = jsonrepair(responseBody);

        // Try parsing the response to JSON, and if it fails, store it as text
        try {
          const jsonResponse = JSON.parse(fixedData);
          if (fixedData.includes("node")) {
            const structuredData = await extractPostDetails(jsonResponse);

            // Store the posts in the MongoDB collection
            for (const post of structuredData) {
              try {
                // Use updateOne with upsert: true to either update or insert the post
                await postsCollection.updateOne(
                  { _id: post._id }, // Filter by postId (_id)
                  { $set: post }, // Update the post data
                  { upsert: true } // Insert the post if it doesn't exist
                );
                console.log(`Post ${post._id} processed (inserted/updated)`);
              } catch (err) {
                console.error(`Error processing post ${post._id}:`, err);
              }
            }

            // Optionally store the JSON response for debugging
            fs.writeFileSync(
              "response_with_data.json",
              JSON.stringify(jsonResponse, null, 2)
            );
          }
        } catch (parseError) {
          console.log(parseError);
          console.error(
            "Error parsing response to JSON. Saving raw response as text..."
          );

          // Save the raw text response if parsing fails
          fs.writeFileSync("response_raw.txt", responseBody);
          console.log(
            "Response successfully saved as text to response_raw.txt"
          );
        }
      } catch (err) {
        console.error("Error retrieving response:", err);
      }
    }
  });

  const autoScroll = async (page, maxScrolls = 30) => {
    await page.evaluate(async (maxScrolls) => {
      let scrolls = 0;
      await new Promise((resolve) => {
        const distance = 100; // Distance to scroll each time
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          scrolls++;
          if (scrolls >= maxScrolls) {
            clearInterval(timer);
            resolve();
          }
        }, 100); // Time interval for scrolling (in ms)
      });
    }, maxScrolls);
  };

  // Navigate to the target page
  await page.goto("https://www.facebook.com", { waitUntil: "networkidle2" });

  // Log in to Facebook
  await page.type("#email", "deshiweeknd@gmail.com"); // Replace with your email
  await page.type("#pass", "mukhsud123"); // Replace with your password

  // Submit the login form
  await Promise.all([
    page.click('[name="login"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  // Infinite loop
  while (true) {
    for (const url of sources) {
      console.log(`Navigating to: ${url}`);

      // Navigate to each URL
      await page.goto(url, { waitUntil: "networkidle2" });

      // Scroll down after navigating to the page
      await autoScroll(page);

      // Wait for 30 seconds before moving to the next page
      console.log(`Waiting for 30 seconds on: ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait for 30 seconds
    }
  }

  // The browser never closes, it keeps looping infinitely
};

main();
