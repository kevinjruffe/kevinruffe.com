import { $, chalk, question } from "zx";

/*
|-------------------------------------------------------------------------------
| CREATE A NEW BLOG POST
|-------------------------------------------------------------------------------
*/

// Turn off verbose mode.
$.verbose = false;

const date = new Date();

// Get nice string version for post body.
const dateLocaleString = date.toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

// Get raw title from user and make URL-safe version.
const [rawTitle, urlEncodedTitle] = await question(
  chalk.green("\nWhat would you like to name this post? ")
).then((rawTitle) => [
  rawTitle,
  encodeURIComponent(rawTitle.toLowerCase().replaceAll(/\s/g, "-")),
]);

// Create path and filename from date and title.
const newPostFile = `blog/src/${date.toISOString()}_${urlEncodedTitle}.md`;

// Create file with title as heading and the date.
await $`echo "# ["${rawTitle}"](/"${urlEncodedTitle}")\n<div class=\"post-date\">"${dateLocaleString}"</div>" > ${newPostFile}`;

console.log(chalk.green("\nFile created!\n"));
