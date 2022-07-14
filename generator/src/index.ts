import { $, chalk, fs } from "zx";
import { marked } from "marked";
import { ForegroundColor, Modifiers } from "chalk";
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
const [[template, notFoundTemplate], css, [srcPostFileNames, srcPostContents]] =
  await Promise.all([
    readTemplateFiles(),
    readAndMinifiyCSS(),
    readPostNamesAndContents(),
    createBuildOutputDirs(),
  ]).catch((err) =>
    handleFailure(
      "Failed while trying to read files or create directories!",
      err
    )
  );

// Now that needed directories are in place, copy pre-built files.
logStep("Copying pre-built files over to `built` directory.");
await copyPreBuiltFilesOver();

// Get post title from filenames.
logStep("Getting post titles from filenames.");
const postTitles = getTitlesFromFileNames(srcPostFileNames);

// Get HTML from Markdown files.
logStep("Getting HTML contents from Markdown source.");
const postContentsAsHTML = getMarkdownBasedHTML(srcPostContents);

// Now that all necessary data is in memory, write blog site to built directory.
// ALso, inject minified CSS into 404 page.
logStep("Finalizing HTML files for blog.");
await generateBlogFromTemplatesTitlesAndContents(
  template,
  notFoundTemplate,
  css,
  postTitles,
  postContentsAsHTML
);

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
function addSyntaxHighlightingHTML(htmlContents: string[]): string[] {
  return htmlContents.map((html) => {
    const htmlWithHighlightingClassAdded = html.replaceAll(
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
  });
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
    fs.copy("blog/404.html", "blog/built/404.html"),
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
 * Using the template, it builds the HTML contents for a blog index page.
 */
function getIndexPageHTML(
  currentPost: number,
  postContentsAsHTML: string[],
  css: string,
  template: string
): string {
  return template
    .replace("TITLE_TO_REPLACE", "Blog")
    .replace(
      "<!-- CONTENTS -->",
      getCombinedPostsHTML(
        postContentsAsHTML,
        currentPost,
        postContentsAsHTML.length
      ) + getPaginationButtonHTML(currentPost, postContentsAsHTML.length)
    )
    .replace("/* STYLES */", css);
}

/**
 * Given the template, CSS, the post titles and the post contents as HTML, this
 * will build the complete blog HTML files.
 */
async function generateBlogFromTemplatesTitlesAndContents(
  template: string,
  notFoundTemplate: string,
  css: string,
  postTitles: string[],
  postContentsAsHTML: string[]
): Promise<void> {
  const notFoundTemplateWithCSSAdded = fs.writeFile(
    "blog/built/404.html",
    notFoundTemplate.replace("/* STYLES */", css)
  );

  const allBlogPagesAndIndexPages = postContentsAsHTML.reduce(
    (fileWrites, htmlContent, index) => {
      const ordinalIndex = index + 1;
      const firstIndexPageNeeded =
        ordinalIndex === POSTS_PER_PAGE ||
        ordinalIndex === postContentsAsHTML.length;
      const noIndexPageNeeded = !(
        ordinalIndex % POSTS_PER_PAGE === 0 ||
        ordinalIndex === postContentsAsHTML.length
      );

      fileWrites.push(
        fs.writeFile(
          `blog/built/${postTitles[index]}.html`,
          getPostPageHTML(postTitles[index], htmlContent, css, template)
        )
      );

      if (noIndexPageNeeded) return fileWrites;

      const fileContents = getIndexPageHTML(
        ordinalIndex,
        postContentsAsHTML,
        css,
        template
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
    },
    [] as Promise<void>[]
  );

  await Promise.all([
    notFoundTemplateWithCSSAdded,
    allBlogPagesAndIndexPages,
  ]).catch((err) => handleFailure("Failed while generating blog files!", err));
}

/**
 * Get the HTML for combined posts. This is for what I'm calling "index pages".
 */
function getCombinedPostsHTML(
  postContentsAsHTML: string[],
  ordinalIndex: number,
  listLength: number
): string {
  const postsToGoBackInList =
    ordinalIndex === listLength && listLength % POSTS_PER_PAGE !== 0
      ? listLength % POSTS_PER_PAGE
      : POSTS_PER_PAGE;

  return postContentsAsHTML
    .slice(ordinalIndex - postsToGoBackInList, ordinalIndex)
    .map((html) => `<article>${html}</article>`)
    .join("<hr />");
}

/**
 * Gets HTML contents from Markdown contents.
 */
function getMarkdownBasedHTML(markdownContents: string[]): string[] {
  try {
    const htmlFromMarkdown = markdownContents.map((markdown) =>
      marked
        .parse(markdown)
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .trimEnd()
    );
    return addSyntaxHighlightingHTML(htmlFromMarkdown);
  } catch (err) {
    handleFailure("Failed to parse Markdown!", err);
  }
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
  postTitle: string,
  postContent: string,
  css: string,
  template: string
): string {
  const regex = new RegExp(
    `(?<=<a href="\\/${postTitle}">)[\\S\\s]*?(?=<\\/a>)`
  );

  const titleToUse = (postContent.match(regex) ?? [])[0] ?? "Blog";

  return template
    .replaceAll("TITLE_TO_REPLACE", titleToUse)
    .replace("<!-- CONTENTS -->", postContent)
    .replace("/* STYLES */", css);
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
 * Gets HTML for `Previous` button on index page.
 */
function getPreviousButtonHTML(ordinalIndex: number): string {
  const visibility = ordinalIndex > POSTS_PER_PAGE ? "visible" : "hidden";

  return `<a style="visibility: ${visibility}" href="/page/${Math.ceil(
    (ordinalIndex - POSTS_PER_PAGE) / POSTS_PER_PAGE
  )}">&lt;&lt;&lt;</a>`;
}

/**
 * Gets blog post titles from blog post filenames.
 */
function getTitlesFromFileNames(fileNames: string[]): string[] {
  try {
    return fileNames.map((fileName) => {
      const title = fileName.split("_").at(-1)?.replace(".md", "");

      if (!title) throw new Error("Invalid filename format encountered.");

      return title;
    });
  } catch (err) {
    handleFailure("Failed while getting post titles from filenames!", err);
  }
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
async function readPostNamesAndContents(): Promise<[string[], string[]]> {
  // Reverse names to put newest posts first.
  const names = await fs.readdir("blog/src").then((list) => list.reverse());

  const contents = await Promise.all(
    names.map((fileName) => fs.readFile(`blog/src/${fileName}`, "utf8"))
  );

  return [names, contents];
}

/**
 * Read the two template files: the one for blog post pages and the 404 page.
 */
async function readTemplateFiles(): Promise<[string, string]> {
  return await Promise.all([
    fs.readFile("blog/template.html", "utf8"),
    fs.readFile("blog/404.html", "utf8"),
  ]);
}
