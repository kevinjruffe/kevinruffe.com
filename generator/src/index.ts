import { $, chalk, fs } from "zx";
import { marked } from "marked";
import { ForegroundColor, Modifiers } from "chalk";
import {
  GeneratedPost,
  ReadSourceBlogFilenamesAndPosts,
  ReadTemplateFiles,
} from "./types";
import highlight from "highlight.js/lib/common";
import CleanCSS from "clean-css";

/*
|-------------------------------------------------------------------------------
| CONFIGURATION
|-------------------------------------------------------------------------------
|
| Settings for script.
|
*/

// Define number of posts on an index page.
const POSTS_PER_PAGE = Number(process.env.POSTS_PER_PAGE ?? 5);

// Turn off verbose mode.
$.verbose = false;

/*
|-------------------------------------------------------------------------------
| BUILD SCRIPT
|-------------------------------------------------------------------------------
|
| Builds the site.
|
*/

logStep("STARTING THE SITE BUILD", "green");

// Create build directories, read HTML template, read and minify CSS, and read
// source Markdown files.
logStep(
  "Reading template and blog source files while generating necessary directories."
);
const [templateFiles, css, postFilenamesAndContents] = await Promise.all([
  readTemplateFiles(),
  readAndMinifiyCSS(),
  readPostFilenamesAndContents(),
  createBuildOutputDirs(),
]).catch((err) =>
  handleFailure("Failed while trying to read files or create directories!", err)
);

logStep("Transforming source material into titles and HTML content.");
const generatedPosts = getGeneratedPosts(postFilenamesAndContents);

// Now that all necessary data is in memory, write blog site to built directory.
logStep("Building the complete blog from generated HTML.");
await generateBlog(templateFiles, generatedPosts, css);

logStep("SITE BUILD COMPLETE!\n", "green");

/*
|-------------------------------------------------------------------------------
| HELPER FUNCTIONS
|-------------------------------------------------------------------------------
|
| Nicely packaging some of the logic used in the main script.
|
*/

/**
 * Enhance HTML with markup that enables code syntax highlighting.
 */
function addSyntaxHighlightingHTML(htmlContent: string): string {
  const htmlWithHighlightingClassAdded = htmlContent.replaceAll(
    '<code class="language-',
    '<code class="hljs language-'
  );

  const codeBlocksInHtml = [
    ...htmlWithHighlightingClassAdded.matchAll(
      /(?<=<pre><code(.*)>)[\s\S]*?(?=<\/code><\/pre>)/g
    ),
  ].map((codeBlock) => codeBlock[0]);

  return codeBlocksInHtml.reduce(
    (htmlPost, codeBlock) =>
      htmlPost.replace(codeBlock, highlight.highlightAuto(codeBlock).value),
    htmlWithHighlightingClassAdded
  );
}

/**
 * Copy pre-built files over to `built` directory.
 */
async function copyPreBuiltFilesOver(): Promise<void> {
  await Promise.all([
    fs.copy("blog/fonts", "blog/built/public/fonts"),
    fs.copy("blog/favicon.ico", "blog/built/public/favicon.ico"),
    $`cp blog/*.webp blog/built/public/`,
    fs.copy("blog/images", "blog/built/public"),
  ]).catch((err) =>
    handleFailure("Failed while copying pre-built files!", err)
  );
}

/**
 * Build the `built` output directories needed for the site.
 */
async function createBuildOutputDirs(): Promise<void> {
  await Promise.all([
    fs.mkdirp("blog/built/page"),
    fs.mkdirp("blog/built/public/images"),
  ]);
}

/**
 * Generate the HTML 404 page from template and CSS file.
 */
async function generate404Page(
  css: string,
  notFoundTemplate: ReadTemplateFiles["notFoundTemplate"]
): Promise<void> {
  try {
    await fs.writeFile(
      "blog/built/404.html",
      notFoundTemplate.replace("/* STYLES */", css)
    );
  } catch (err) {
    handleFailure("Failed while generating 404 page!", err);
  }
}

/**
 * Given the template, CSS, the post titles and the post contents as HTML, this
 * will build the complete blog HTML files.
 */
async function generateBlog(
  templateFiles: ReadTemplateFiles,
  generatedPosts: GeneratedPost[],
  css: string
): Promise<void> {
  await Promise.all([
    copyPreBuiltFilesOver(),
    generate404Page(css, templateFiles.notFoundTemplate),
    generatePostPages(css, generatedPosts, templateFiles.pageTemplate),
  ]);
}

/**
 * Generate the blog post pages from the template, HTML contents and CSS.
 */
async function generatePostPages(
  css: string,
  generatedPosts: GeneratedPost[],
  pageTemplate: ReadTemplateFiles["pageTemplate"]
): Promise<void> {
  try {
    generatedPosts.reduce((fileWrites, post, index) => {
      const ordinalIndex = index + 1;
      const firstIndexPageNeeded =
        ordinalIndex === POSTS_PER_PAGE ||
        (ordinalIndex === generatedPosts.length &&
          generatedPosts.length < POSTS_PER_PAGE);
      const noIndexPageNeeded = !(
        ordinalIndex % POSTS_PER_PAGE === 0 ||
        ordinalIndex === generatedPosts.length
      );

      fileWrites.push(
        fs.writeFile(
          `blog/built/${post.path}.html`,
          getPostPageHTML(post, css, pageTemplate)
        )
      );

      if (noIndexPageNeeded) return fileWrites;

      const fileContents = getIndexPageHTML(
        ordinalIndex,
        generatedPosts,
        css,
        pageTemplate
      );

      fileWrites.push(
        fs.writeFile(
          `blog/built/page/${Math.ceil(ordinalIndex / POSTS_PER_PAGE)}.html`,
          fileContents
        )
      );

      if (firstIndexPageNeeded) {
        fileWrites.push(fs.writeFile("blog/built/index.html", fileContents));
      }

      return fileWrites;
    }, [] as Promise<void>[]);
  } catch (err) {
    handleFailure("Failed while generating blog post pages!", err);
  }
}

/**
 * Get the HTML for combined posts. This is for what I'm calling "index pages".
 */
function getCombinedPostsHTML(
  posts: GeneratedPost[],
  ordinalIndex: number
): string {
  const listLength = posts.length;

  const postsToGoBackInList =
    ordinalIndex === listLength && listLength % POSTS_PER_PAGE !== 0
      ? listLength % POSTS_PER_PAGE
      : POSTS_PER_PAGE;

  return posts
    .slice(ordinalIndex - postsToGoBackInList, ordinalIndex)
    .map((post) => `<article>${post.content}</article>`)
    .join("<hr />");
}

/**
 * Creates blog post path's and URL from filenames and HTML contents.
 */
function getGeneratedPosts(
  postFilenamesAndContents: ReadSourceBlogFilenamesAndPosts
): GeneratedPost[] {
  return postFilenamesAndContents.srcPostFilenames.map((filename, index) => {
    const content = getMarkdownBasedHTML(
      postFilenamesAndContents.srcPostContents[index]
    );

    const path = getPostUrlPathFromFilename(filename);

    return {
      content,
      path,
      title: getPostTitleFromPathAndContents(path, content),
    };
  });
}

/**
 * Using the template, it builds the HTML contents for a blog index page.
 */
function getIndexPageHTML(
  currentPost: number,
  posts: GeneratedPost[],
  css: string,
  template: string
): string {
  return template
    .replace("TITLE_TO_REPLACE", "Blog")
    .replace(
      "<!-- CONTENTS -->",
      getCombinedPostsHTML(posts, currentPost) +
        getPaginationButtonHTML(currentPost, posts.length)
    )
    .replace("/* STYLES */", css);
}

/**
 * Gets HTML contents from Markdown contents.
 */
function getMarkdownBasedHTML(markdownContent: string): string {
  try {
    const htmlFromMarkdown = marked
      .parse(markdownContent)
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .trimEnd();

    return addSyntaxHighlightingHTML(htmlFromMarkdown);
  } catch (err) {
    handleFailure("Failed to parse Markdown!", err);
  }
}

/**
 * Gets HTML for `Next` button on index pages.
 */
function getNextButtonHTML(ordinalIndex: number, listLength: number): string {
  const visibility = ordinalIndex !== listLength ? "visible" : "hidden";

  return `<a style="visibility: ${visibility}" href="/page/${
    (ordinalIndex + POSTS_PER_PAGE) / POSTS_PER_PAGE
  }">&gt;&gt;&gt;</a>`;
}

/**
 * Get HTML for pagination buttons on index pages.
 */
function getPaginationButtonHTML(
  ordinalIndex: number,
  listLength: number
): string {
  return `<div class="pagination-buttons">${getPreviousButtonHTML(
    ordinalIndex
  )}${getNextButtonHTML(ordinalIndex, listLength)}</div>`;
}

/**
 * Using the template, it builds the final HTML contents for a single blog
 * post page.
 */
function getPostPageHTML(
  post: GeneratedPost,
  css: string,
  template: string
): string {
  return template
    .replaceAll("TITLE_TO_REPLACE", post.title)
    .replace("<!-- CONTENTS -->", post.content)
    .replace("/* STYLES */", css);
}

/**
 * Get the GeneratedPost title from the post's path and contents.
 */
function getPostTitleFromPathAndContents(
  postPath: GeneratedPost["path"],
  postContent: GeneratedPost["content"]
): GeneratedPost["title"] {
  const regex = new RegExp(
    `(?<=<a href="\\/${postPath}">)[\\S\\s]*?(?=<\\/a>)`
  );

  return (postContent.match(regex) ?? [])[0] ?? "Blog";
}

/**
 * Gets blog post URL path from blog post filename.
 */
function getPostUrlPathFromFilename(filename: string): string {
  try {
    const path = filename.split("_").at(-1)?.replace(".md", "");

    if (!path) throw new Error("Invalid filename format encountered.");

    return path;
  } catch (err) {
    handleFailure("Failed while getting post titles from filenames!", err);
  }
}

/**
 * Gets HTML for `Previous` button on index page.
 */
function getPreviousButtonHTML(ordinalIndex: number): string {
  const visibility = ordinalIndex > POSTS_PER_PAGE ? "visible" : "hidden";

  return `<a style="visibility: ${visibility}" href="/page/${Math.ceil(
    (ordinalIndex - POSTS_PER_PAGE) / POSTS_PER_PAGE
  )}">&lt;&lt;&lt;</a>`;
}

/**
 * Log and exit on script error.
 */
function handleFailure(message: string, err: unknown): never {
  console.error(`\n${chalk.red(message)}\n${err}\n`);
  process.exit(1);
}

/**
 * Log a step in the build process.
 */
function logStep(message: string, color = "reset"): void {
  console.log(
    `\n${chalk[color as typeof ForegroundColor | typeof Modifiers](message)}`
  );
}

/**
 * Reads the CSS file for the blog and minifies the contents.
 */
async function readAndMinifiyCSS(): Promise<string> {
  return (
    await new CleanCSS({ returnPromise: true }).minify(["blog/style.css"])
  ).styles;
}

/**
 * Gets blog post names and contents.
 */
async function readPostFilenamesAndContents(): Promise<ReadSourceBlogFilenamesAndPosts> {
  // Reverse names to put newest posts first.
  const srcPostFilenames = await fs
    .readdir("blog/src")
    .then((list) => list.reverse());

  const srcPostContents = await Promise.all(
    srcPostFilenames.map((fileName) =>
      fs.readFile(`blog/src/${fileName}`, "utf8")
    )
  );

  return { srcPostFilenames, srcPostContents };
}

/**
 * Read the two template files: the one for blog post pages and the 404 page.
 */
async function readTemplateFiles(): Promise<ReadTemplateFiles> {
  const [pageTemplate, notFoundTemplate] = await Promise.all([
    fs.readFile("blog/template.html", "utf8"),
    fs.readFile("blog/404.html", "utf8"),
  ]);

  return { pageTemplate, notFoundTemplate };
}
