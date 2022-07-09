import { $, chalk, fs, ProcessPromise } from "zx";
import { marked } from "marked";
import highlight from "highlight.js/lib/common";

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

logStep("STARTING THE SITE BUILD", true);

// Create build directories, read HTML template, read and minify CSS, and read
// source Markdown files.
logStep(
  "Reading template and blog source files while generating necessary directories."
);
const [template, { stdout: css }, [srcPostFileNames, srcPostContents]] =
  await Promise.all([
    fs.readFile("blog/template.html", "utf8"),
    $`cleancss blog/style.css`,
    getPostNamesAndContents(),
    $`mkdir -p blog/built/page`,
    $`mkdir -p blog/built/public/images`,
  ]).catch((err) => handleFailure("Failed while trying to read files!", err));

// Now that needed directories are in place, copy pre-built files.
logStep("Copying pre-built files over to `built` directory.");
await Promise.all([
  $`cp -R blog/fonts blog/built/public/fonts`,
  $`cp blog/favicon.ico blog/built/public/favicon.ico`,
  $`cp blog/*.webp blog/built/public/`,
  $`cp -R blog/images blog/built/public/`,
  $`cp blog/404.html blog/built/404.html`,
]).catch((err) => handleFailure("Failed while copying pre-built files", err));

let postTitles: string[], postContentsAsHTML: string[];
try {
  // Get post title from filenames.
  logStep("Getting post titles from filenames.");
  postTitles = getTitlesFromFileNames(srcPostFileNames);
  // Get HTML from Markdown files.
  logStep("Getting HTML contents from Markdown source.");
  postContentsAsHTML = getMarkdownBasedHTML(srcPostContents);
} catch (err) {
  handleFailure(
    "Failed while gettings post titles or while converting Markdown to HTML!",
    err
  );
}

// Now that all necessary data is in memory, write blog site to built directory.
// ALso, inject minified CSS into 404 page.
logStep("Finalizing HTML files for blog.");
await Promise.all([
  addCSSTo404Page(css),
  generateBlogFromTemplateTitlesAndContents(
    template,
    css,
    postTitles,
    postContentsAsHTML
  ),
]);

logStep("SITE BUILD COMPLETE!\n", true);

/*
|-------------------------------------------------------------------------------
| HELPER FUNCTIONS
|-------------------------------------------------------------------------------
|
| Nicely packaging some of the logic used in the main script.
|
*/

/**
 * Injects minified CSS into 404 page.
 */
async function addCSSTo404Page(css: string): Promise<void> {
  const notFoundContents = await fs.readFile("blog/built/404.html", "utf8");

  await fs.writeFile(
    "blog/built/404.html",
    notFoundContents.replace("/* STYLES */", css)
  );
}

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
async function generateBlogFromTemplateTitlesAndContents(
  template: string,
  css: string,
  postTitles: string[],
  postContentsAsHTML: string[]
): Promise<void> {
  await Promise.all(
    postContentsAsHTML.reduce((fileWrites, htmlContent, index) => {
      const ordinalIndex = index + 1;
      const firstIndexPageNeeded =
        ordinalIndex === POSTS_PER_PAGE ||
        ordinalIndex === postContentsAsHTML.length;
      const noIndexPageNeeded = !(
        ordinalIndex % POSTS_PER_PAGE === 0 ||
        ordinalIndex === postContentsAsHTML.length
      );

      fileWrites.push(
        $`echo ${getPostPageHTML(
          postTitles[index],
          htmlContent,
          css,
          template
        )} > blog/built/${postTitles[index]}.html`
      );

      if (noIndexPageNeeded) return fileWrites;

      const fileContents = getIndexPageHTML(
        ordinalIndex,
        postContentsAsHTML,
        css,
        template
      );

      fileWrites.push(
        $`echo ${fileContents} > blog/built/page/${Math.ceil(
          ordinalIndex / POSTS_PER_PAGE
        )}.html`
      );

      if (firstIndexPageNeeded) {
        fileWrites.push($`echo ${fileContents} > blog/built/index.html`);
      }

      return fileWrites;
    }, [] as ProcessPromise[])
  );
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
  const htmlFromMarkdown = markdownContents.map((markdown) =>
    marked
      .parse(markdown)
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .trimEnd()
  );

  return addSyntaxHighlightingHTML(htmlFromMarkdown);
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
 * Gets blog post names and contents.
 */
async function getPostNamesAndContents(): Promise<[string[], string[]]> {
  // Reverse names to put newest posts first.
  const names = await fs.readdir("blog/src").then((list) => list.reverse());

  const contents = await Promise.all(
    names.map((fileName) => fs.readFile(`blog/src/${fileName}`, "utf8"))
  );

  return [names, contents];
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
  return fileNames.map((fileName) => {
    const title = fileName.split("_").at(-1)?.replace(".md", "");

    if (!title) throw new Error("Invalid filename format encountered.");

    return title;
  });
}

/**
 * Log and exit on script error.
 */
function handleFailure(message: string, err: unknown): never {
  console.error(`\n${chalk.red(message)}\nERROR:${err}\n`);
  process.exit(1);
}

/**
 * Log a step in the build process.
 */
function logStep(message: string, useColor = false): void {
  console.log(`\n${chalk[useColor ? "green" : "reset"](message)}`);
}
